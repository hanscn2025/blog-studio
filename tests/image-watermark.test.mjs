import test from "node:test";
import assert from "node:assert/strict";
import { defaultWatermark, drawWatermark, imageToDataUrl, normalizeWatermark } from "../src/image-watermark.js";

test("watermark settings clamp unsafe values and keep the filename whitelist", () => {
  const settings = normalizeWatermark({ size: 99, opacity: -2, count: 99, direction: "wrong", whitelist: "logo.png" });
  assert.equal(settings.size, 18);
  assert.equal(settings.opacity, 5);
  assert.equal(settings.count, 12);
  assert.equal(settings.direction, defaultWatermark.direction);
  assert.equal(settings.whitelist, "logo.png");
});

test("disabled watermark does not draw, enabled center draws once", () => {
  const calls = [];
  const ctx = { save() {}, restore() {}, translate() {}, rotate() {}, fillText(...args) { calls.push(args); }, measureText() { return { width: 100 }; } };
  drawWatermark(ctx, 640, 360, { ...defaultWatermark, enabled: false });
  assert.equal(calls.length, 0);
  drawWatermark(ctx, 640, 360, { ...defaultWatermark, layout: "center" });
  assert.equal(calls.length, 1);
  drawWatermark(ctx, 640, 360, { ...defaultWatermark, count: 3 });
  assert.equal(calls.length, 4);
});

test("whitelisted files and covers can retain original image data", async () => {
  const previous = globalThis.FileReader;
  globalThis.FileReader = class { readAsDataURL() { this.result = "data:image/png;base64,original"; this.onload(); } };
  try {
    const file = { name: "LOGO.PNG", type: "image/png" };
    assert.equal(await imageToDataUrl(file, { ...defaultWatermark, whitelist: "logo.png" }), "data:image/png;base64,original");
    assert.equal(await imageToDataUrl(file, { ...defaultWatermark, enabled: false }), "data:image/png;base64,original");
  } finally { globalThis.FileReader = previous; }
});
