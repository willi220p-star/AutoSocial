const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
process.chdir(root);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function dashboardPort() {
  try {
    const text = fs.readFileSync(path.join(root, ".env"), "utf8");
    const match = text.match(/^DASHBOARD_PORT=(.+)$/m);
    if (match && match[1].trim()) return match[1].trim();
  } catch {
    // .env is created just before this is read.
  }
  return "3000";
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 18) {
  console.error("Install Node.js 18 or newer from https://nodejs.org and run this again.");
  process.exit(1);
}

if (!fs.existsSync(path.join(root, "node_modules", "express"))) {
  console.log("Installing dashboard packages...");
  run("npm", ["ci"]);
}

if (!fs.existsSync(path.join(root, ".env"))) {
  fs.copyFileSync(path.join(root, ".env.example"), path.join(root, ".env"));
  console.log("Created .env from .env.example.");
}

console.log("Installing the Chromium browser used for TikTok and YouTube...");
run("npx", ["playwright", "install", "chromium"]);

const port = dashboardPort();
console.log("");
console.log("Open this address in the browser on THIS computer:");
console.log(`http://127.0.0.1:${port}`);
console.log("");
console.log("Leave this window open. Sign in to TikTok and YouTube from the dashboard.");
console.log("Those sign-ins stay on this computer. The cloud browser login does not transfer.");
console.log("Also post to YouTube is on: after TikTok accepts a video, the same file goes to YouTube.");
console.log("");

const child = spawn(process.execPath, ["src/dashboard-server.js"], {
  cwd: root,
  stdio: "inherit",
});

function stop() {
  if (!child.killed) child.kill("SIGINT");
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code || 0));
