#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const webDir = path.join(projectRoot, "web");
const docsDir = path.join(projectRoot, "docs");

fs.mkdirSync(docsDir, { recursive: true });
fs.writeFileSync(path.join(docsDir, ".nojekyll"), "");

for (const name of ["app.js", "style.css", "github-live.js"]) {
  fs.copyFileSync(path.join(webDir, name), path.join(docsDir, name));
}

let html = fs.readFileSync(path.join(webDir, "index.html"), "utf8");
const liveScript = '<script src="github-live.js"></script>';
if (!html.includes(liveScript)) {
  html = html.replace(
    '<script src="app.js"></script>',
    `${liveScript}\n  <script src="app.js"></script>`
  );
}
fs.writeFileSync(path.join(docsDir, "index.html"), html);
console.log("Synced dashboard files to docs/ for GitHub Pages.");
