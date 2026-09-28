const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

function getBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  return value.toString().toLowerCase() === "true";
}

const projectRoot = path.resolve(__dirname, "..");
const dataRoot = path.resolve(
  process.env.DATA_ROOT || (process.env.VERCEL ? "/tmp/autosocial-data" : projectRoot)
);

function resolveDataPath(value, fallback) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return path.resolve(dataRoot, fallback);
  }
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(dataRoot, trimmed);
}

function resolveOptionalProjectPath(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(dataRoot, trimmed);
}

const config = {
  projectRoot,
  dataRoot,
  queueDir: resolveDataPath(process.env.QUEUE_DIR, "queue/default/tiktok/pending"),
  postedDir: resolveDataPath(process.env.POSTED_DIR, "queue/default/tiktok/posted"),
  failedDir: resolveDataPath(process.env.FAILED_DIR, "queue/default/tiktok/failed"),
  profileDir: resolveDataPath(process.env.BROWSER_PROFILE_DIR, ".profile"),
  instagramQueueDir: resolveDataPath(
    process.env.INSTAGRAM_QUEUE_DIR,
    "queue/default/instagram/pending"
  ),
  instagramPostedDir: resolveDataPath(
    process.env.INSTAGRAM_POSTED_DIR,
    "queue/default/instagram/posted"
  ),
  instagramFailedDir: resolveDataPath(
    process.env.INSTAGRAM_FAILED_DIR,
    "queue/default/instagram/failed"
  ),
  instagramProfileDir: resolveDataPath(
    process.env.INSTAGRAM_PROFILE_DIR,
    ".profile-instagram"
  ),
  youtubeQueueDir: resolveDataPath(
    process.env.YOUTUBE_QUEUE_DIR,
    "queue/default/youtube/pending"
  ),
  youtubePostedDir: resolveDataPath(
    process.env.YOUTUBE_POSTED_DIR,
    "queue/default/youtube/posted"
  ),
  youtubeFailedDir: resolveDataPath(
    process.env.YOUTUBE_FAILED_DIR,
    "queue/default/youtube/failed"
  ),
  youtubeProfileDir: resolveDataPath(
    process.env.YOUTUBE_PROFILE_DIR,
    ".profile-youtube"
  ),
  cronExpression: process.env.CRON_EXPRESSION || "0 */2 * * *",
  instagramCronExpression: process.env.INSTAGRAM_CRON_EXPRESSION || "0 */2 * * *",
  youtubeCronExpression: process.env.YOUTUBE_CRON_EXPRESSION || "0 */2 * * *",
  timezone: process.env.TZ || "UTC",
  browserLocale: process.env.BROWSER_LOCALE || "en-US",
  headless: getBoolean(process.env.HEADLESS, false),
  postDelayMs: Number(process.env.POST_DELAY_MS || 15000),
  postPublishHoldMs: Number(process.env.POST_PUBLISH_HOLD_MS || 25000),
  failureHoldMs: Number(process.env.FAILURE_HOLD_MS || 8000),
  autoAddSound: getBoolean(process.env.AUTO_ADD_SOUND, false),
  randomQueueOrder: getBoolean(process.env.RANDOM_QUEUE_ORDER, false),
  defaultSoundQuery: process.env.DEFAULT_SOUND_QUERY || "",
  defaultCaption: process.env.DEFAULT_CAPTION || "",
  uploadPageUrl:
    process.env.TIKTOK_UPLOAD_URL || "https://www.tiktok.com/tiktokstudio/upload",
  instagramUploadPageUrl:
    process.env.INSTAGRAM_UPLOAD_URL || "https://www.instagram.com/create/style/",
  youtubeUploadPageUrl:
    process.env.YOUTUBE_UPLOAD_URL || "https://studio.youtube.com",
  dashboardHost: process.env.DASHBOARD_HOST || "127.0.0.1",
  dashboardPort: Number(process.env.DASHBOARD_PORT || 3000),
  dashboardAllowRemote: getBoolean(process.env.DASHBOARD_ALLOW_REMOTE, false),
  uniquifyInputDir: resolveDataPath(process.env.UNIQUIFY_INPUT_DIR, "queue/uniquify-input"),
  uniquifyOutputDir: resolveDataPath(process.env.UNIQUIFY_OUTPUT_DIR, "queue/uniquify-output"),
  uniquifyLogoImage: resolveOptionalProjectPath(process.env.UNIQUIFY_LOGO_IMAGE),
  uniquifyIntroSeconds: Number(process.env.UNIQUIFY_INTRO_SECONDS || 1),
  uniquifyEndHoldSeconds: Number(process.env.UNIQUIFY_END_HOLD_SECONDS || 0.4),

  // Auto-download pipeline
  autoDownload: {
    channel: process.env.WATCH_CHANNEL || "",
    interval: Number(process.env.WATCH_INTERVAL || 10),
    maxVideos: Number(process.env.WATCH_MAX_VIDEOS || 5),
    minViews: Number(process.env.WATCH_MIN_VIEWS || 0),
    platforms: (process.env.AUTO_POST_PLATFORMS || "tiktok")
      .split(",")
      .map((p) => p.trim().toLowerCase()),
  },
};

// Map platform names to their queue directories
config.platformQueues = {
  tiktok: config.queueDir,
  instagram: config.instagramQueueDir,
  youtube: config.youtubeQueueDir,
};

module.exports = {
  config,
};
