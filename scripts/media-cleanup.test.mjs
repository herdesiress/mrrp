import assert from "node:assert/strict";
import test from "node:test";
import { getRemovedMediaFiles } from "./media-cleanup.mjs";

test("cleans deleted site media and unused editor uploads only", () => {
  const removed = getRemovedMediaFiles(
    "![old](./media/11111111-2222-3333-4444-555555555555.png)",
    "![kept](./media/22222222-3333-4444-5555-666666666666.mp4)",
    [
      "33333333-4444-5555-6666-777777777777.mp3",
      "44444444-5555-6666-7777-888888888888.wav",
      "not-a-media-file"
    ]
  );
  assert.deepEqual(removed, [
    "33333333-4444-5555-6666-777777777777.mp3",
    "44444444-5555-6666-7777-888888888888.wav",
    "11111111-2222-3333-4444-555555555555.png"
  ]);
});

test("preserves editor uploads still referenced by the draft", () => {
  const filename = "33333333-4444-5555-6666-777777777777.mp3";
  assert.deepEqual(
    getRemovedMediaFiles("", `![audio](./media/${filename})`, [filename]),
    []
  );
});
