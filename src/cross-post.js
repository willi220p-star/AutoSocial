async function crossPostAfterTikTok({
  enabled,
  sessionSaved,
  uploadVideo,
  closeLogin,
  videoPath,
  caption,
  accountId,
}) {
  if (!enabled) {
    return { ok: false, skipped: true, reason: "YouTube cross-post is turned off." };
  }
  if (!sessionSaved) {
    return {
      ok: false,
      skipped: true,
      reason: "YouTube is not signed in, so this TikTok video was not posted there.",
    };
  }

  if (typeof closeLogin === "function") {
    await closeLogin();
  }

  const result = await uploadVideo({ videoPath, caption, accountId });
  if (result?.ok) {
    return { ok: true };
  }
  return {
    ok: false,
    error: result?.error || "YouTube upload failed.",
    screenshotPath: result?.screenshotPath,
  };
}

module.exports = {
  crossPostAfterTikTok,
};
