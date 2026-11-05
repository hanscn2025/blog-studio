export function plainDescription(markdown = "") {
  const text = markdown
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^\s*!\[[^\]]*\]\([^\n]*\)\s*$/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+.*$/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:>\s*|[-*+]\s+|\d+\.\s+)/gm, "")
    .replace(/[*_~`]/g, "")
    .split(/\n\s*\n/)
    .map(part => part.replace(/\s+/g, " ").trim())
    .find(Boolean) || "";
  return Array.from(text).slice(0, 160).join("");
}
