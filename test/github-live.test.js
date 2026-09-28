const test = require("node:test");
const assert = require("node:assert/strict");
const { createMemoryStore, handleLiveRequest } = require("../web/github-live.js");

function request(store, method, pathname, body) {
  return handleLiveRequest(store, method, pathname, body);
}

test("github pages api starts with the default brand", () => {
  const store = createMemoryStore();
  const accounts = request(store, "GET", "/api/accounts");
  assert.equal(accounts.status, 200);
  assert.equal(accounts.body.activeAccount.name, "Default");
  assert.equal(accounts.body.accounts.length, 1);
});

test("github pages api saves a brand, caption, schedule, and queue name", () => {
  const store = createMemoryStore();
  const added = request(store, "POST", "/api/accounts/add", { name: "Live brand" });
  assert.equal(added.status, 200);
  assert.equal(added.body.account.name, "Live brand");

  const settings = request(store, "POST", "/api/settings/save", {
    payload: { DEFAULT_CAPTION: "Ship note" },
  });
  assert.equal(settings.body.ok, true);

  const schedule = request(store, "POST", "/api/schedule", { expression: "30 12 * * *" });
  assert.equal(schedule.body.ok, true);

  const invalid = request(store, "POST", "/api/instagram/schedule", { expression: "nope" });
  assert.equal(invalid.status, 400);

  const queued = request(store, "POST", "/api/github/queue", {
    platform: "tiktok",
    name: "launch.mp4",
    hasCaption: true,
  });
  assert.equal(queued.body.ok, true);

  const status = request(store, "GET", "/api/status");
  assert.equal(status.body.defaultCaption, "Ship note");
  assert.equal(status.body.cronExpression, "30 12 * * *");
  assert.equal(status.body.queue.counts.pending, 1);
  assert.equal(status.body.queue.pendingVideos[0].name, "launch.mp4");
  assert.equal(status.body.queue.pendingVideos[0].hasCaption, true);
  assert.equal(status.body.accountId, added.body.account.id);

  const overview = request(store, "GET", "/api/overview");
  assert.equal(overview.body[added.body.account.id].tiktok.queue.counts.pending, 1);
});

test("github pages api refuses posting and login without pretending they worked", () => {
  const store = createMemoryStore();
  const run = request(store, "POST", "/api/run-once", {});
  assert.equal(run.status, 200);
  assert.equal(run.body.ok, false);
  assert.equal(run.body.skipped, true);
  assert.match(run.body.reason, /cannot upload/i);

  const login = request(store, "POST", "/api/tiktok/login", {});
  assert.equal(login.body.ok, false);
  assert.match(login.body.message, /Chromium/i);

  const health = request(store, "GET", "/api/setup/health");
  assert.equal(health.body.overall, "warn");
  assert.ok(health.body.checks.some((check) => check.id === "pages" && check.status === "ok"));
  assert.ok(health.body.checks.some((check) => check.id === "playwright" && check.status === "warn"));
});

test("github pages api keeps auto-download settings and blocks the download", () => {
  const store = createMemoryStore();
  const saved = request(store, "POST", "/api/autodownload/configure", {
    channel: "@studio",
    interval: 15,
    maxVideos: 3,
    platforms: ["tiktok", "youtube"],
  });
  assert.equal(saved.body.ok, true);
  const status = request(store, "GET", "/api/autodownload/status");
  assert.equal(status.body.channel, "@studio");
  assert.equal(status.body.interval, 15);
  assert.deepEqual(status.body.platforms, ["tiktok", "youtube"]);

  const started = request(store, "POST", "/api/autodownload/start", {});
  assert.equal(started.body.ok, false);
  assert.match(started.body.error, /yt-dlp/i);
});
