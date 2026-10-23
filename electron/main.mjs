import { app, BrowserWindow, dialog, shell, utilityProcess } from "electron";
import net from "node:net";
import path from "node:path";

/**
 * Desktop shell. Runs the standalone Next.js server as a hidden background
 * process and shows it in a window, so the app opens with a double-click and
 * never needs a terminal.
 */

// A fixed port keeps the page's origin the same between launches. The
// watchlist lives in localStorage, which is scoped to the origin, so a new
// port every time would make saved tickers look lost.
const PREFERRED_PORT = 47615;
const HOST = "127.0.0.1";
const STARTUP_TIMEOUT_MS = 20_000;

let server = null;
let win = null;

function serverDir() {
  // Packaged: copied next to the app by electron-builder's extraResources.
  // From source (`npm run desktop`): straight out of the Next build.
  return app.isPackaged
    ? path.join(process.resourcesPath, "server")
    : path.join(app.getAppPath(), ".next", "standalone");
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, HOST, () => probe.close(() => resolve(true)));
  });
}

function anyFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, HOST, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function startServer() {
  // Another program on our port is rare, but falling back beats refusing to
  // open. The watchlist just won't show for that session.
  const port = (await isPortFree(PREFERRED_PORT)) ? PREFERRED_PORT : await anyFreePort();
  const dir = serverDir();

  server = utilityProcess.fork(path.join(dir, "server.js"), [], {
    cwd: dir,
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: HOST },
    serviceName: "Drawdown Analyzer server",
    stdio: "inherit",
  });

  let exited = false;
  server.once("exit", () => {
    exited = true;
    server = null;
  });

  const origin = `http://${HOST}:${port}`;
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited) throw new Error("The server process exited during startup.");
    try {
      const res = await fetch(origin, { cache: "no-store" });
      if (res.ok) return origin;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`The server didn't respond within ${STARTUP_TIMEOUT_MS / 1000} seconds.`);
}

function createWindow(origin) {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 600,
    show: false,
    title: "Drawdown Analyzer",
    // Matches --color-canvas so there's no flash before the first paint.
    backgroundColor: "#ffffff",
  });

  // Anything that isn't the app itself (news links, docs) belongs in the
  // user's real browser, not in a bare window with no address bar.
  const isOwn = (url) => url === origin || url.startsWith(`${origin}/`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isOwn(url)) win.loadURL(url);
    else if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (isOwn(url)) return;
    event.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    win = null;
  });
  win.loadURL(origin);
}

if (!app.requestSingleInstanceLock()) {
  // Already open: the first instance focuses its window (below) and this one
  // leaves before starting a second server.
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    try {
      createWindow(await startServer());
    } catch (err) {
      dialog.showErrorBox("Drawdown Analyzer couldn't start", String(err?.message ?? err));
      app.quit();
    }
  });

  // The window is the whole app, so closing it quits, macOS included; a dock
  // icon with a server still running behind it would just be confusing.
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => server?.kill());
}
