export function contentSummary(snapshot, current){
  const hasLocalDraft=!current.file && (Boolean(current.content?.trim()) || Boolean(current.slug) || Boolean(current.title && current.title!=="未命名文章"));
  const articles=hasLocalDraft?[...snapshot,current]:snapshot.map(item=>item.file===current.file?current:item);
  return {total:articles.length,drafts:articles.filter(item=>item.status!=="已发布").length,published:articles.filter(item=>item.status==="已发布").length,hasLocalDraft};
}
