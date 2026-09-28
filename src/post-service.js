const fs = require("fs/promises");
const path = require("path");
const { config } = require("./config");
const { getNextQueuedItem, getCaptionPaths } = require("./queue");
const { uploadVideo } = require("./tiktok-uploader");
const { uploadVideo: uploadToYouTube, closeLoginSession: closeYouTubeLogin } = require("./youtube-uploader");
const { hasSavedPlatformSession } = require("./account-manager");
const { crossPostAfterTikTok } = require("./cross-post");
const { ensureDirectories, fileExists, moveWithTimestamp } = require("./fs-utils");

async function moveCaptionsIfExists(captionPaths, targetDir) {
  const moved = [];
  for (const cp of captionPaths) {
    if (await fileExists(cp)) {
      const result = await moveFileSafely(cp, targetDir, "caption file");
      if (result) moved.push(result);
    }
  }
  return moved.length > 0 ? moved[0] : null;
}

async function moveFileSafely(sourcePath, targetDir, label) {
  try {
    return await moveWithTimestamp(sourcePath, targetDir);
  } catch (error) {
    console.error(`Could not move ${label}: ${error.message}`);
    return null;
  }
}

async function postSingleVideo({ videoPath, caption, source, postedDir, failedDir, accountId }) {
  const posted = postedDir || config.postedDir;
  const failed = failedDir || config.failedDir;
  await ensureDirectories([posted, failed]);

  const result = await uploadVideo({ videoPath, caption, source, accountId });
  const captionPaths = getCaptionPaths(videoPath);

  if (result.ok) {
    let youtube = null;
    try {
      const sessionSaved = accountId
        ? await hasSavedPlatformSession("youtube", accountId)
        : false;
      youtube = await crossPostAfterTikTok({
        enabled: config.crossPostTikTokToYouTube,
        sessionSaved,
        uploadVideo: uploadToYouTube,
        closeLogin: closeYouTubeLogin,
        videoPath,
        caption,
        accountId,
      });
    } catch (error) {
      youtube = { ok: false, error: error.message };
    }

    const movedVideo = await moveFileSafely(videoPath, posted, "posted video");
    const movedCaption = await moveCaptionsIfExists(captionPaths, posted);
    if (!movedVideo) {
      return {
        ok: false,
        error: "Video posted, but could not archive file from queue.",
        screenshotPath: result.screenshotPath,
      };
    }
    return { ok: true, movedVideo, movedCaption, youtube };
  }

  const movedVideo = await moveFileSafely(videoPath, failed, "failed video");
  const movedCaption = await moveCaptionsIfExists(captionPaths, failed);
  return {
    ok: false,
    movedVideo,
    movedCaption,
    error: result.error,
    screenshotPath: result.screenshotPath,
  };
}

async function postNextFromQueue({ source, queueDir, postedDir, failedDir, accountId } = {}) {
  const queue = queueDir || config.queueDir;
  const posted = postedDir || config.postedDir;
  const failed = failedDir || config.failedDir;
  await ensureDirectories([queue, posted, failed]);

  const nextItem = await getNextQueuedItem(queue);
  if (!nextItem) {
    return { ok: true, skipped: true, reason: "Queue is empty." };
  }

  return postSingleVideo({ ...nextItem, source, postedDir: posted, failedDir: failed, accountId });
}

async function postFromManualInput(videoPath, caption) {
  const resolvedPath = path.resolve(videoPath);
  await fs.access(resolvedPath);
  return postSingleVideo({
    videoPath: resolvedPath,
    caption: caption || "",
  });
}

module.exports = {
  postNextFromQueue,
  postFromManualInput,
};
