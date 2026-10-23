export const WATERMARK_KEY = "hans-blog-watermark-v1";
export const defaultWatermark = { enabled: true, text: "Hans Blog", size: 7, opacity: 22, count: 4, direction: "diagonal-up", layout: "repeat", color: "white", whitelist: "" };

export function normalizeWatermark(value = {}) {
  const choice = (input, allowed, fallback) => allowed.includes(input) ? input : fallback;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : defaultWatermark.enabled,
    text: String(value.text ?? defaultWatermark.text).slice(0, 60),
    size: Math.min(18, Math.max(2, Number(value.size) || defaultWatermark.size)),
    opacity: Math.min(80, Math.max(5, Number(value.opacity) || defaultWatermark.opacity)),
    count: Math.min(12, Math.max(1, Math.round(Number(value.count) || defaultWatermark.count))),
    direction: choice(value.direction, ["horizontal", "diagonal-up", "diagonal-down"], defaultWatermark.direction),
    layout: choice(value.layout, ["repeat", "center"], defaultWatermark.layout),
    color: choice(value.color, ["white", "black"], defaultWatermark.color),
    whitelist: String(value.whitelist ?? "").slice(0, 2000),
  };
}

export function drawWatermark(ctx, width, height, rawSettings) {
  const settings = normalizeWatermark(rawSettings);
  if (!settings.enabled || !settings.text.trim()) return;
  const fontSize = Math.max(12, Math.round(width * settings.size / 100));
  const angle = settings.direction === "horizontal" ? 0 : settings.direction === "diagonal-up" ? -Math.PI / 6 : Math.PI / 6;
  ctx.save();
  ctx.font = `600 ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = settings.color;
  ctx.globalAlpha = settings.opacity / 100;
  const count = settings.layout === "center" ? 1 : settings.count;
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  for (let index = 0; index < count; index++) {
    const row = Math.floor(index / columns);
    const rowCount = Math.min(columns, count - row * columns);
    const column = index % columns;
    const x = settings.layout === "center" ? width / 2 : width * (column + 0.5) / rowCount;
    const y = settings.layout === "center" ? height / 2 : height * (row + 0.5) / rows;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillText(settings.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

export async function imageToDataUrl(file, settings) {
  const config = normalizeWatermark(settings);
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
  const names = config.whitelist.split(/[\n,，]/).map(name => name.trim().toLowerCase()).filter(Boolean);
  if (names.includes(file.name.toLowerCase())) return readDataUrl(file);
  if (config.enabled && !config.text.trim()) throw new Error("请先填写水印文字，或关闭自动水印");
  if (config.enabled && file.type === "image/gif") throw new Error("动态 GIF 暂不支持加水印；请先关闭自动水印或选择静态图片");
  if (!config.enabled) return readDataUrl(file);
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器无法处理图片水印");
    ctx.drawImage(image, 0, 0);
    drawWatermark(ctx, canvas.width, canvas.height, config);
    const type = ["image/jpeg", "image/webp"].includes(file.type) ? file.type : "image/png";
    return canvas.toDataURL(type, 0.9);
  } finally { URL.revokeObjectURL(source); }
}

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}
