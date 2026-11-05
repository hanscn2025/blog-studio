const imageLink = /!\[[^\]]*\]\(([^)]+)\)/g;

export function localImagePaths(markdown = "") {
  return [...new Set([...markdown.matchAll(imageLink)].map(match => match[1].trim().replace(/^<|>$/g, "")).filter(path => !/^(?:https?:|asset:|data:|\/\/)/i.test(path)))];
}

export function matchLocalImages(markdown, files) {
  const images = [...files].filter(file => /^image\/(?:png|jpeg|webp|gif)$/.test(file.type));
  const matched = [], unresolved = [];
  for (const path of localImagePaths(markdown)) {
    let decoded;
    try { decoded = decodeURIComponent(path.replace(/^file:\/\//i, "")); } catch { decoded = path; }
    const normalized = decoded.replaceAll("\\", "/").replace(/^\.\//, "");
    const exact = images.filter(file => normalized.endsWith(`/${file.webkitRelativePath || file.name}`) || (file.webkitRelativePath || "").endsWith(`/${normalized}`));
    const candidates = exact.length ? exact : images.filter(file => file.name === normalized.split("/").at(-1));
    if (candidates.length === 1) matched.push({ path, file: candidates[0] });
    else unresolved.push(path);
  }
  return { matched, unresolved };
}
