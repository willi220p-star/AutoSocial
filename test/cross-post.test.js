const test = require("node:test");
const assert = require("node:assert/strict");
const { crossPostAfterTikTok } = require("../src/cross-post");

test("cross-post sends the TikTok video to YouTube when both are ready", async () => {
  const calls = [];
  const result = await crossPostAfterTikTok({
    enabled: true,
    sessionSaved: true,
    videoPath: "/tmp/clip.mp4",
    caption: "Launch clip",
    accountId: "default",
    closeLogin: async () => {
      calls.push("close");
    },
    uploadVideo: async (input) => {
      calls.push(input);
      return { ok: true };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls[0], "close");
  assert.equal(calls[1].videoPath, "/tmp/clip.mp4");
  assert.equal(calls[1].caption, "Launch clip");
  assert.equal(calls[1].accountId, "default");
});

test("cross-post does not call YouTube when the switch is off or YouTube is signed out", async () => {
  let uploads = 0;
  const uploadVideo = async () => {
    uploads += 1;
    return { ok: true };
  };

  const off = await crossPostAfterTikTok({
    enabled: false,
    sessionSaved: true,
    uploadVideo,
  });
  const signedOut = await crossPostAfterTikTok({
    enabled: true,
    sessionSaved: false,
    uploadVideo,
  });

  assert.equal(off.skipped, true);
  assert.equal(signedOut.skipped, true);
  assert.equal(uploads, 0);
});

test("cross-post keeps the TikTok success when YouTube fails", async () => {
  const result = await crossPostAfterTikTok({
    enabled: true,
    sessionSaved: true,
    uploadVideo: async () => ({ ok: false, error: "Publish button missing" }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Publish button missing");
});
