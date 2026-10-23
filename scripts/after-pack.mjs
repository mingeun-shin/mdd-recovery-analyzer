// electron-builder hook: copies the standalone Next.js server into the
// packaged app's resources folder, where electron/main.mjs looks for it.
//
// This isn't done with `extraResources` because electron-builder always
// strips node_modules from those, and the server can't run without the
// next/react copies traced into .next/standalone/node_modules. It runs
// before code signing, so the signature still covers these files.
import { cpSync } from "node:fs";
import path from "node:path";

export default async function afterPack({ appOutDir, electronPlatformName, packager }) {
  const resources =
    electronPlatformName === "darwin"
      ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : path.join(appOutDir, "resources");

  cpSync(".next/standalone", path.join(resources, "server"), { recursive: true });
}
