/**
 * Browser stand-in for the Express dashboard API.
 * GitHub Pages cannot run Node, Playwright, FFmpeg, or yt-dlp.
 * This module keeps brands, settings, schedules, and queue file names
 * in localStorage and returns a clear error for anything that needs a computer.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    api.installBrowser();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STORAGE_KEY = "autosocial-live-v1";
  const PLATFORMS = ["tiktok", "instagram", "youtube"];
  const PLATFORM_LABELS = {
    tiktok: "TikTok",
    instagram: "Instagram",
    youtube: "YouTube",
  };
  const VIDEO_EXTS = [".mp4", ".mov", ".webm", ".avi", ".mkv"];
  const SETTINGS_KEYS = new Set([
    "AUTO_ADD_SOUND",
    "DEFAULT_CAPTION",
    "DEFAULT_SOUND_QUERY",
    "RANDOM_QUEUE_ORDER",
  ]);
  const POST_LIMIT =
    "GitHub Pages cannot upload videos. The queue and schedule stay saved in this browser. Run AutoSocial on your computer to post.";
  const SIGN_IN_URLS = {
    tiktok: "https://www.tiktok.com/login",
    instagram: "https://www.instagram.com/accounts/login/",
    youtube: "https://studio.youtube.com/",
  };
  const FFMPEG_LIMIT =
    "GitHub Pages cannot run FFmpeg. Names listed here are saved in this browser. Process the videos in AutoSocial on your computer.";
  const DOWNLOAD_LIMIT =
    "GitHub Pages cannot run yt-dlp. Channel settings can be saved here. Start the download from AutoSocial on your computer.";
  const FOLDER_LIMIT =
    "GitHub Pages cannot open a folder on your computer. Files you add here are names saved in this browser.";

  function nowIso() {
    return new Date().toISOString();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultDaemon() {
    return {
      running: false,
      isPosting: false,
      cronExpression: "",
      schedulePlan: { type: "cron", expression: "" },
      instantPost: false,
      lastRunAt: null,
      lastResult: null,
      logs: [
        {
          at: nowIso(),
          level: "info",
          message: "Saved in this browser. GitHub Pages will not post when a schedule is due.",
        },
      ],
    };
  }

  function defaultState() {
    return {
      version: 1,
      accounts: [{ id: "default", name: "Default" }],
      activeAccountId: "default",
      settings: {
        AUTO_ADD_SOUND: "false",
        DEFAULT_CAPTION: "",
        DEFAULT_SOUND_QUERY: "",
        RANDOM_QUEUE_ORDER: "false",
      },
      daemons: {},
      queues: {},
      sessions: {},
      uniquifier: {
        inputDir: "browser://uniquifier/input",
        outputDir: "browser://uniquifier/output",
        logoImage: "",
        inputFiles: [],
        outputFiles: [],
        logs: [
          {
            at: nowIso(),
            level: "info",
            message: "File names stay in this browser. FFmpeg runs only in the local app.",
          },
        ],
      },
      autodownload: {
        channel: "",
        interval: 10,
        maxVideos: 5,
        minViews: 0,
        platforms: ["tiktok"],
        lastCheckAt: null,
        totalDownloaded: 0,
        logs: [
          {
            at: nowIso(),
            level: "info",
            message: "Channel settings stay in this browser. yt-dlp runs only in the local app.",
          },
        ],
      },
      profileDownload: {
        logs: [],
      },
    };
  }

  function createMemoryStore(seed) {
    let state = seed ? clone(seed) : defaultState();
    return {
      load() {
        return clone(state);
      },
      save(next) {
        state = clone(next);
      },
    };
  }

  function createLocalStore() {
    return {
      load() {
        try {
          return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        } catch (err) {
          return null;
        }
      },
      save(next) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      },
    };
  }

  function sanitizeName(name) {
    return String(name || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 60);
  }

  function makeId(name) {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    return base || "account";
  }

  function ensureUniqueId(baseId, existing) {
    if (!existing.has(baseId)) return baseId;
    let index = 2;
    while (existing.has(`${baseId}-${index}`)) index += 1;
    return `${baseId}-${index}`;
  }

  function loadState(store) {
    const raw = store.load();
    if (!raw || raw.version !== 1 || !Array.isArray(raw.accounts) || !raw.accounts.length) {
      const fresh = defaultState();
      store.save(fresh);
      return fresh;
    }
    if (!raw.accounts.some((item) => item.id === raw.activeAccountId)) {
      raw.activeAccountId = raw.accounts[0].id;
    }
    raw.daemons = raw.daemons || {};
    raw.queues = raw.queues || {};
    raw.sessions = raw.sessions || {};
    raw.settings = Object.assign(defaultState().settings, raw.settings || {});
    raw.uniquifier = Object.assign(defaultState().uniquifier, raw.uniquifier || {});
    raw.autodownload = Object.assign(defaultState().autodownload, raw.autodownload || {});
    raw.profileDownload = Object.assign(defaultState().profileDownload, raw.profileDownload || {});
    return raw;
  }

  function activeAccount(state) {
    return (
      state.accounts.find((item) => item.id === state.activeAccountId) || state.accounts[0]
    );
  }

  function ensureDaemon(state, accountId, platform) {
    if (!state.daemons[accountId]) state.daemons[accountId] = {};
    if (!state.daemons[accountId][platform]) {
      state.daemons[accountId][platform] = defaultDaemon();
    }
    return state.daemons[accountId][platform];
  }

  function ensureQueue(state, accountId, platform) {
    if (!state.queues[accountId]) state.queues[accountId] = {};
    if (!Array.isArray(state.queues[accountId][platform])) {
      state.queues[accountId][platform] = [];
    }
    return state.queues[accountId][platform];
  }

  function pushLog(target, message, level) {
    const logs = Array.isArray(target.logs) ? target.logs : [];
    logs.push({ at: nowIso(), level: level || "info", message: String(message) });
    target.logs = logs.slice(-40);
  }

  function timezoneName() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch (err) {
      return "UTC";
    }
  }

  function queueView(items) {
    const list = Array.isArray(items) ? items : [];
    const pendingVideos = list
      .filter((item) => item.status !== "posted" && item.status !== "failed")
      .map((item) => ({ name: item.name, hasCaption: Boolean(item.hasCaption) }));
    return {
      counts: {
        pending: pendingVideos.length,
        posted: list.filter((item) => item.status === "posted").length,
        failed: list.filter((item) => item.status === "failed").length,
      },
      pendingVideos,
    };
  }

  function platformStatus(state, accountId, platform) {
    const daemon = ensureDaemon(state, accountId, platform);
    const settings = state.settings || {};
    return {
      running: Boolean(daemon.running),
      isPosting: false,
      cronExpression: daemon.cronExpression || "",
      schedulePlan: daemon.schedulePlan || { type: "cron", expression: daemon.cronExpression || "" },
      instantPost: Boolean(daemon.instantPost),
      timezone: timezoneName(),
      autoAddSound: String(settings.AUTO_ADD_SOUND).toLowerCase() === "true",
      defaultCaption: settings.DEFAULT_CAPTION || "",
      defaultSoundQuery: settings.DEFAULT_SOUND_QUERY || "",
      randomQueueOrder: String(settings.RANDOM_QUEUE_ORDER).toLowerCase() === "true",
      accountId,
      queue: queueView(ensureQueue(state, accountId, platform)),
      lastRunAt: daemon.lastRunAt,
      lastResult: daemon.lastResult,
      logs: daemon.logs || [],
    };
  }

  function isCron(expression) {
    const parts = String(expression || "").trim().split(/\s+/);
    if (parts.length !== 5 && parts.length !== 6) return false;
    const field =
      /^(\*|\*\/[1-9]\d*|[0-9]{1,2}(-[0-9]{1,2})?(,[0-9]{1,2}(-[0-9]{1,2})?)*|[A-Za-z]{3}(-[A-Za-z]{3})?(,[A-Za-z]{3})*)$/;
    return parts.every((part) => field.test(part));
  }

  function normalizeDailyTimes(times) {
    const source = Array.isArray(times) ? times : [];
    const normalized = source
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .map((value) => {
        const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value);
        if (!match) {
          throw new Error(`Invalid time "${value}". Use HH:MM (24h).`);
        }
        return `${match[1].padStart(2, "0")}:${match[2]}`;
      });
    const uniqueSorted = Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b));
    if (!uniqueSorted.length) {
      throw new Error("Please provide at least one valid time.");
    }
    return uniqueSorted;
  }

  function cleanFileName(name) {
    const base = String(name || "")
      .split(/[/\\]/)
      .pop()
      .trim();
    if (!base || base === "." || base === "..") return "";
    return base.slice(0, 120);
  }

  function hasVideoExt(name) {
    const lower = name.toLowerCase();
    return VIDEO_EXTS.some((ext) => lower.endsWith(ext));
  }

  function ok(body) {
    return { status: 200, body: body || { ok: true } };
  }

  function blocked(message) {
    return {
      status: 200,
      body: {
        ok: false,
        skipped: true,
        hosted: true,
        reason: message,
        error: message,
        message,
      },
    };
  }

  function fail(status, message) {
    return {
      status,
      body: { ok: false, hosted: true, error: message, message, reason: message },
    };
  }

  function readJson(body) {
    if (body == null || body === "") return {};
    if (typeof body === "object") return body;
    return JSON.parse(body);
  }

  function platformFromPath(pathname) {
    if (pathname.startsWith("/api/instagram")) return "instagram";
    if (pathname.startsWith("/api/youtube")) return "youtube";
    return "tiktok";
  }

  function accountsPayload(state) {
    const active = activeAccount(state);
    return {
      accounts: state.accounts.map((item) => ({ id: item.id, name: item.name })),
      activeAccountId: active.id,
      activeAccount: { id: active.id, name: active.name },
    };
  }

  function buildHealth(state) {
    const active = activeAccount(state);
    const checks = [
      {
        id: "pages",
        label: "GitHub Pages dashboard",
        status: "ok",
        detail: "This page is running in your browser.",
        action: "",
      },
      {
        id: "storage",
        label: "Saved brands and settings",
        status: "ok",
        detail: "Brands, captions, and schedules stay in local storage on this device.",
        action: "",
      },
      {
        id: "playwright",
        label: "Platform sign-in",
        status: "ok",
        detail: "Login opens TikTok, Instagram, or YouTube in a new browser tab.",
        action: "",
      },
      {
        id: "ffmpeg",
        label: "FFmpeg",
        status: "warn",
        detail: "Video processing is not available on GitHub Pages.",
        action: "Run the uniquifier from the local AutoSocial app.",
      },
      {
        id: "yt-dlp",
        label: "yt-dlp",
        status: "warn",
        detail: "Downloads are not available on GitHub Pages.",
        action: "Run Auto Download from the local AutoSocial app.",
      },
      {
        id: "posting",
        label: "Uploads",
        status: "warn",
        detail: "Schedulers saved here do not send posts.",
        action: "Use Run Once from the local app after a queue folder has videos.",
      },
    ];

    const folders = [];
    for (const platform of PLATFORMS) {
      const items = ensureQueue(state, active.id, platform);
      const pendingCount = items.filter((item) => item.status !== "posted" && item.status !== "failed").length;
      folders.push({
        key: `${platform}Pending`,
        platform,
        label: `${PLATFORM_LABELS[platform]} pending queue`,
        path: `browser://${active.id}/${platform}/pending`,
        exists: true,
        pendingCount,
        supported: VIDEO_EXTS,
        hint: "Add video file names below on the platform page. The files stay on your computer.",
      });
      checks.push({
        id: `${platform}-queue`,
        label: `${PLATFORM_LABELS[platform]} queue`,
        status: "ok",
        detail: `${pendingCount} pending name(s) saved in this browser`,
        action: "",
      });
    }

    folders.push(
      {
        key: "uniquifierInput",
        platform: "uniquifier",
        label: "Video Uniquifier input",
        path: state.uniquifier.inputDir,
        exists: true,
        pendingCount: (state.uniquifier.inputFiles || []).length,
        supported: VIDEO_EXTS,
        hint: "Names only. FFmpeg does not run on GitHub Pages.",
      },
      {
        key: "uniquifierOutput",
        platform: "uniquifier",
        label: "Video Uniquifier output",
        path: state.uniquifier.outputDir,
        exists: true,
        pendingCount: (state.uniquifier.outputFiles || []).length,
        supported: VIDEO_EXTS,
        hint: "Processed files appear after you run the local uniquifier.",
      }
    );

    const sessions = PLATFORMS.map((platform) => {
      const record = state.sessions?.[active.id]?.[platform] || {};
      const signedIn = Boolean(record.open);
      return {
        platform,
        label: PLATFORM_LABELS[platform],
        saved: signedIn,
        profileDir: SIGN_IN_URLS[platform],
        action: signedIn
          ? "Sign-in page is open in this browser."
          : "Use Accounts and choose Login Session.",
      };
    });

    const counts = checks.reduce(
      (acc, check) => {
        acc[check.status] = (acc[check.status] || 0) + 1;
        return acc;
      },
      { ok: 0, warn: 0, fail: 0 }
    );

    return {
      generatedAt: nowIso(),
      projectRoot: "browser://autosocial",
      activeAccount: { id: active.id, name: active.name },
      overall: counts.fail ? "fail" : counts.warn ? "warn" : "ok",
      counts,
      checks,
      folders,
      sessions,
      nextSteps: [
        "Add a brand, caption, and schedule here. They stay in this browser.",
        "Add video file names on TikTok, Instagram, or YouTube so the queue is ready to copy.",
        "Use Accounts and Login Session to open TikTok, Instagram, or YouTube and sign in.",
      ],
    };
  }

  function handleLiveRequest(store, method, pathname, rawBody) {
    const verb = String(method || "GET").toUpperCase();
    const path = String(pathname || "").split("?")[0];
    let state = loadState(store);
    let body = {};
    if (verb !== "GET" && verb !== "HEAD") {
      try {
        body = readJson(rawBody);
      } catch (err) {
        return fail(400, "Invalid JSON body.");
      }
    }

    const account = activeAccount(state);
    const route = `${verb} ${path}`;

    function saveSchedule(platform) {
      const expression = String(body.expression || "").trim();
      if (!expression) return fail(400, "Missing expression");
      if (!isCron(expression)) return fail(400, `Invalid cron expression: ${expression}`);
      const daemon = ensureDaemon(state, account.id, platform);
      daemon.cronExpression = expression;
      daemon.schedulePlan = { type: "cron", expression };
      pushLog(daemon, `Schedule saved in this browser: ${expression}`);
      pushLog(daemon, "GitHub Pages will not post when this schedule is due.", "warn");
      store.save(state);
      return ok({ ok: true, cronExpression: expression });
    }

    function saveDaily(platform) {
      if (body.type !== "daily-times") return fail(400, "Unsupported schedule plan type.");
      let times;
      try {
        times = normalizeDailyTimes(body.times);
      } catch (err) {
        return fail(400, err.message);
      }
      const daemon = ensureDaemon(state, account.id, platform);
      daemon.schedulePlan = { type: "daily-times", times };
      daemon.cronExpression = "";
      pushLog(daemon, `Daily times saved in this browser: ${times.join(", ")}`);
      pushLog(daemon, "GitHub Pages will not post at those times.", "warn");
      store.save(state);
      return ok({ ok: true, schedulePlan: daemon.schedulePlan });
    }

    function saveInstant(platform) {
      if (typeof body.enabled !== "boolean") return fail(400, "Missing 'enabled' (boolean)");
      const daemon = ensureDaemon(state, account.id, platform);
      daemon.instantPost = body.enabled;
      pushLog(
        daemon,
        body.enabled
          ? "Instant post preference saved. GitHub Pages still cannot upload."
          : "Instant post turned off for this browser.",
        body.enabled ? "warn" : "info"
      );
      store.save(state);
      return ok({
        ok: true,
        instantPost: daemon.instantPost,
        hosted: body.enabled,
        message: body.enabled ? POST_LIMIT : "",
      });
    }

    if (route === "GET /api/status" || route === "GET /api/instagram/status" || route === "GET /api/youtube/status") {
      const platform = route === "GET /api/instagram/status"
        ? "instagram"
        : route === "GET /api/youtube/status"
          ? "youtube"
          : "tiktok";
      const status = platformStatus(state, account.id, platform);
      store.save(state);
      return ok(status);
    }

    if (route === "POST /api/start" || route === "POST /api/instagram/start" || route === "POST /api/youtube/start") {
      const platform = platformFromPath(path);
      pushLog(ensureDaemon(state, account.id, platform), POST_LIMIT, "warn");
      store.save(state);
      return blocked(POST_LIMIT);
    }

    if (route === "POST /api/stop" || route === "POST /api/instagram/stop" || route === "POST /api/youtube/stop") {
      const daemon = ensureDaemon(state, account.id, platformFromPath(path));
      daemon.running = false;
      store.save(state);
      return ok({ ok: true, alreadyStopped: true });
    }

    if (
      route === "POST /api/run-once" ||
      route === "POST /api/instagram/run-once" ||
      route === "POST /api/youtube/run-once"
    ) {
      const daemon = ensureDaemon(state, account.id, platformFromPath(path));
      daemon.lastRunAt = nowIso();
      daemon.lastResult = { ok: false, skipped: true, reason: POST_LIMIT };
      pushLog(daemon, POST_LIMIT, "warn");
      store.save(state);
      return blocked(POST_LIMIT);
    }

    if (route === "POST /api/schedule") return saveSchedule("tiktok");
    if (route === "POST /api/instagram/schedule") return saveSchedule("instagram");
    if (route === "POST /api/youtube/schedule") return saveSchedule("youtube");
    if (route === "POST /api/schedule-plan") return saveDaily("tiktok");
    if (route === "POST /api/instagram/schedule-plan") return saveDaily("instagram");
    if (route === "POST /api/youtube/schedule-plan") return saveDaily("youtube");
    if (route === "POST /api/instant-post") return saveInstant("tiktok");
    if (route === "POST /api/instagram/instant-post") return saveInstant("instagram");
    if (route === "POST /api/youtube/instant-post") return saveInstant("youtube");

    if (route === "POST /api/settings/save") {
      const payload = body.payload;
      if (!payload || typeof payload !== "object") return fail(400, "Invalid payload.");
      for (const [key, value] of Object.entries(payload)) {
        const envKey = String(key).toUpperCase();
        if (!SETTINGS_KEYS.has(envKey)) return fail(400, `Unsupported setting: ${envKey}`);
        state.settings[envKey] = String(value ?? "");
      }
      store.save(state);
      return ok({ ok: true });
    }

    if (route === "GET /api/accounts") return ok(accountsPayload(state));

    if (route === "POST /api/accounts/add") {
      const name = sanitizeName(body.name);
      if (!name) return fail(400, "Account name is required.");
      const existing = new Set(state.accounts.map((item) => item.id));
      const created = { id: ensureUniqueId(makeId(name), existing), name };
      state.accounts.push(created);
      state.activeAccountId = created.id;
      store.save(state);
      return ok({ ok: true, account: created, state: accountsPayload(state) });
    }

    if (route === "POST /api/accounts/select") {
      const target = state.accounts.find((item) => item.id === body.accountId);
      if (!target) return fail(400, "Account not found.");
      state.activeAccountId = target.id;
      store.save(state);
      return ok({ ok: true, account: { id: target.id, name: target.name }, state: accountsPayload(state) });
    }

    if (
      route === "POST /api/tiktok/login" ||
      route === "POST /api/instagram/login" ||
      route === "POST /api/youtube/login" ||
      route === "GET /api/tiktok/login/status" ||
      route === "GET /api/instagram/login/status" ||
      route === "GET /api/youtube/login/status" ||
      route === "POST /api/tiktok/login/close" ||
      route === "POST /api/instagram/login/close" ||
      route === "POST /api/youtube/login/close"
    ) {
      const platform = path.split("/")[2];
      const openUrl = SIGN_IN_URLS[platform];
      if (!state.sessions[account.id]) state.sessions[account.id] = {};
      const session = state.sessions[account.id][platform] || { open: false };
      state.sessions[account.id][platform] = session;

      if (route.startsWith("GET ")) {
        return ok({ open: Boolean(session.open), saved: Boolean(session.open), hosted: true, openUrl });
      }
      if (route.endsWith("/close")) {
        const alreadyClosed = !session.open;
        session.open = false;
        store.save(state);
        return ok({ ok: true, alreadyClosed, hosted: true });
      }
      const alreadyOpen = Boolean(session.open);
      session.open = true;
      pushLog(
        ensureDaemon(state, account.id, platform),
        `${PLATFORM_LABELS[platform]} sign-in opened at ${openUrl}`
      );
      store.save(state);
      return ok({
        ok: true,
        alreadyOpen,
        hosted: true,
        openUrl,
        message: `${PLATFORM_LABELS[platform]} sign-in is ready.`,
      });
    }

    if (route === "GET /api/overview") {
      const overview = {};
      for (const item of state.accounts) {
        overview[item.id] = {
          tiktok: platformStatus(state, item.id, "tiktok"),
          instagram: platformStatus(state, item.id, "instagram"),
          youtube: platformStatus(state, item.id, "youtube"),
        };
      }
      store.save(state);
      return ok(overview);
    }

    if (route === "GET /api/setup/health") return ok(buildHealth(state));
    if (route === "POST /api/setup/open-folder") return blocked(FOLDER_LIMIT);

    if (route === "GET /api/uniquifier/status") {
      const uniq = state.uniquifier;
      return ok({
        running: false,
        stopRequested: false,
        inputDir: uniq.inputDir,
        outputDir: uniq.outputDir,
        logoImage: uniq.logoImage || "",
        currentFile: null,
        startedAt: null,
        finishedAt: null,
        progress: { processed: 0, total: (uniq.inputFiles || []).length, succeeded: 0, failed: 0 },
        counts: {
          input: (uniq.inputFiles || []).length,
          output: (uniq.outputFiles || []).length,
        },
        inputFiles: uniq.inputFiles || [],
        outputFiles: uniq.outputFiles || [],
        logs: uniq.logs || [],
      });
    }

    if (route === "POST /api/uniquifier/start") {
      state.uniquifier.inputDir = String(body.inputDir || state.uniquifier.inputDir);
      state.uniquifier.outputDir = String(body.outputDir || state.uniquifier.outputDir);
      state.uniquifier.logoImage = String(body.logoImage || "");
      pushLog(state.uniquifier, FFMPEG_LIMIT, "warn");
      store.save(state);
      return blocked(FFMPEG_LIMIT);
    }

    if (route === "POST /api/uniquifier/stop") return ok({ ok: true, alreadyStopped: true });
    if (route === "POST /api/uniquifier/open-folder") return blocked(FOLDER_LIMIT);

    if (route === "GET /api/autodownload/status") {
      const ad = state.autodownload;
      return ok({
        running: false,
        isDownloading: false,
        channel: ad.channel || "",
        interval: ad.interval || 10,
        maxVideos: ad.maxVideos || 5,
        minViews: ad.minViews || 0,
        platforms: ad.platforms || ["tiktok"],
        accountId: account.id,
        lastCheckAt: ad.lastCheckAt,
        totalDownloaded: ad.totalDownloaded || 0,
        logs: ad.logs || [],
      });
    }

    if (route === "POST /api/autodownload/start") {
      pushLog(state.autodownload, DOWNLOAD_LIMIT, "warn");
      store.save(state);
      return blocked(DOWNLOAD_LIMIT);
    }

    if (route === "POST /api/autodownload/stop") return ok({ ok: true, alreadyStopped: true });

    if (route === "POST /api/autodownload/configure") {
      const ad = state.autodownload;
      if (typeof body.channel === "string") ad.channel = body.channel.trim();
      if (body.interval) ad.interval = parseInt(body.interval, 10) || ad.interval;
      if (body.maxVideos) ad.maxVideos = parseInt(body.maxVideos, 10) || ad.maxVideos;
      if (Array.isArray(body.platforms)) {
        ad.platforms = body.platforms.filter((item) => PLATFORMS.includes(item));
      }
      pushLog(ad, "Auto-download settings saved in this browser.");
      store.save(state);
      return ok({ ok: true });
    }

    if (route === "GET /api/profile-download/status") {
      return ok({
        running: false,
        logs: state.profileDownload.logs || [],
        downloadsDir: "browser://profile-downloads",
      });
    }

    if (route === "POST /api/profile-download/start") {
      if (!String(body.channel || "").trim()) return fail(400, "No channel provided.");
      pushLog(state.profileDownload, DOWNLOAD_LIMIT, "warn");
      store.save(state);
      return blocked(DOWNLOAD_LIMIT);
    }

    if (route === "POST /api/profile-download/open-folder") return blocked(FOLDER_LIMIT);

    if (route === "POST /api/github/queue") {
      const platform = body.platform;
      if (!PLATFORMS.includes(platform)) return fail(400, "Unknown platform.");
      const queue = ensureQueue(state, account.id, platform);
      const action = body.action || "add";
      if (action === "clear") {
        state.queues[account.id][platform] = queue.filter(
          (item) => item.status === "posted" || item.status === "failed"
        );
        pushLog(ensureDaemon(state, account.id, platform), "Pending queue names cleared in this browser.");
        store.save(state);
        return ok({ ok: true });
      }
      const fileName = cleanFileName(body.name);
      if (!fileName) return fail(400, "Enter a video file name.");
      const storedName = hasVideoExt(fileName) ? fileName : `${fileName}.mp4`;
      if (action === "remove") {
        state.queues[account.id][platform] = queue.filter((item) => item.name !== storedName);
        store.save(state);
        return ok({ ok: true });
      }
      if (!queue.some((item) => item.name === storedName && item.status !== "posted" && item.status !== "failed")) {
        queue.push({ name: storedName, hasCaption: Boolean(body.hasCaption), status: "pending" });
      } else {
        const existing = queue.find((item) => item.name === storedName);
        if (existing) existing.hasCaption = Boolean(body.hasCaption);
      }
      pushLog(ensureDaemon(state, account.id, platform), `Queued file name: ${storedName}`);
      store.save(state);
      return ok({ ok: true, name: storedName });
    }

    if (route === "POST /api/github/uniquifier-files") {
      const fileName = cleanFileName(body.name);
      if (body.action === "clear") {
        state.uniquifier.inputFiles = [];
        store.save(state);
        return ok({ ok: true });
      }
      if (!fileName) return fail(400, "Enter a video file name.");
      const storedName = hasVideoExt(fileName) ? fileName : `${fileName}.mp4`;
      const files = state.uniquifier.inputFiles || [];
      if (!files.includes(storedName)) files.push(storedName);
      state.uniquifier.inputFiles = files.sort((a, b) => a.localeCompare(b));
      pushLog(state.uniquifier, `Listed input name: ${storedName}`);
      store.save(state);
      return ok({ ok: true, name: storedName });
    }

    if (path.startsWith("/api/")) return fail(404, `Unknown API route: ${route}`);
    return null;
  }

  function installBrowser() {
    if (window.__autosocialGithubLive) return;
    window.__autosocialGithubLive = true;
    const store = createLocalStore();
    const nativeFetch = window.fetch.bind(window);

    window.fetch = function (input, init) {
      const url = new URL(typeof input === "string" ? input : input.url, window.location.origin);
      if (!url.pathname.startsWith("/api/")) {
        return nativeFetch(input, init);
      }
      const method = (init && init.method) || (typeof input !== "string" && input.method) || "GET";
      let result;
      try {
        result = handleLiveRequest(store, method, url.pathname, init && init.body);
      } catch (err) {
        result = fail(500, err.message || "Browser API failed.");
      }
      if (!result) return nativeFetch(input, init);
      return Promise.resolve(
        new Response(JSON.stringify(result.body), {
          status: result.status,
          headers: { "Content-Type": "application/json" },
        })
      );
    };

    document.addEventListener("DOMContentLoaded", () => {
      const main = document.querySelector(".main-content");
      if (main && !document.getElementById("githubLiveBanner")) {
        const banner = document.createElement("div");
        banner.id = "githubLiveBanner";
        banner.className = "github-live-banner";
        banner.textContent =
          "Login opens TikTok, Instagram, or YouTube in a new tab so you can sign in there. Brands, captions, schedules, and queue names stay in this browser.";
        main.insertBefore(banner, main.firstChild);
      }

      mountQueueAdder("ttQueueList", "tiktok");
      mountQueueAdder("igQueueList", "instagram");
      mountQueueAdder("ytQueueList", "youtube");
      mountUniquifierAdder();
    });
  }

  function mountQueueAdder(listId, platform) {
    const list = document.getElementById(listId);
    if (!list || list.previousElementSibling?.dataset?.githubQueue === platform) return;
    const box = document.createElement("div");
    box.className = "github-queue-add";
    box.dataset.githubQueue = platform;
    box.innerHTML = `
      <input class="control-input github-queue-name" type="text" placeholder="clip-name.mp4" />
      <label class="github-queue-caption"><input type="checkbox" /> Caption file</label>
      <button type="button" class="control-btn-small primary github-queue-add-btn">Add name</button>
      <button type="button" class="control-btn-small github-queue-clear-btn">Clear</button>
      <input class="github-queue-files" type="file" accept="video/*,.mp4,.mov,.webm,.mkv,.avi" multiple />
    `;
    list.parentNode.insertBefore(box, list);

    const nameInput = box.querySelector(".github-queue-name");
    const caption = box.querySelector('input[type="checkbox"]');
    const add = async (name, hasCaption) => {
      const response = await fetch("/api/github/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, name, hasCaption: Boolean(hasCaption), action: "add" }),
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        alert(data.error || data.message || "Could not add that file name.");
      }
    };

    box.querySelector(".github-queue-add-btn").addEventListener("click", () => {
      add(nameInput.value, caption.checked);
      nameInput.value = "";
    });
    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        add(nameInput.value, caption.checked);
        nameInput.value = "";
      }
    });
    box.querySelector(".github-queue-clear-btn").addEventListener("click", () => {
      fetch("/api/github/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, action: "clear" }),
      });
    });
    box.querySelector(".github-queue-files").addEventListener("change", async (event) => {
      const files = Array.from(event.target.files || []);
      for (const file of files) {
        await add(file.name, caption.checked);
      }
      event.target.value = "";
    });
  }

  function mountUniquifierAdder() {
    const list = document.getElementById("uniqInputFiles");
    if (!list || document.getElementById("githubUniqAdd")) return;
    const box = document.createElement("div");
    box.id = "githubUniqAdd";
    box.className = "github-queue-add";
    box.innerHTML = `
      <input class="control-input github-queue-name" type="text" placeholder="source-clip.mp4" />
      <button type="button" class="control-btn-small primary github-queue-add-btn">List input</button>
      <button type="button" class="control-btn-small github-queue-clear-btn">Clear</button>
    `;
    list.parentNode.insertBefore(box, list);
    const nameInput = box.querySelector(".github-queue-name");
    const add = () => {
      fetch("/api/github/uniquifier-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameInput.value, action: "add" }),
      });
      nameInput.value = "";
    };
    box.querySelector(".github-queue-add-btn").addEventListener("click", add);
    box.querySelector(".github-queue-clear-btn").addEventListener("click", () => {
      fetch("/api/github/uniquifier-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
    });
  }

  return {
    createMemoryStore,
    createLocalStore,
    defaultState,
    handleLiveRequest,
    installBrowser,
  };
});
