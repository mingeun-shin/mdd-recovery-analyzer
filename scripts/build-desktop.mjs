// Builds the self-contained Next.js server that the desktop app runs in the
// background (see electron/main.mjs). Run through `npm run desktop` or
// `npm run desktop:dist`, which put `next` on the PATH.
import { execSync } from "node:child_process";
import { cpSync } from "node:fs";

execSync("next build", { stdio: "inherit", env: { ...process.env, NEXT_STANDALONE: "1" } });

// The standalone output leaves these out on the assumption that a CDN serves
// them. On the desktop there is no CDN, so server.js has to serve them itself.
cpSync("public", ".next/standalone/public", { recursive: true });
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
