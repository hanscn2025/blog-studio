export const DRAFTS_KEY = "hans-article-drafts-v1";
export const PENDING_KEY = "hans-article-pending-v1";

export function hasDraftContent(article) {
  return !!article && !article.remote && !!(article.slug || article.content?.trim() || (article.title && article.title !== "未命名文章") || article.description || article.cover || article.category || article.tags || article.keywords || article.updated || article.channels?.length || article.pendingImages?.length || article.top || article.featured || article.comments === false || article.toc === false || article.video_as_cover === false);
}

export function upsertDraft(drafts, article) {
  if ((!hasDraftContent(article) && !article.draftStarted) || !article.draftId || article.remote) return drafts;
  const index = drafts.findIndex(draft => draft.draftId === article.draftId);
  return index < 0 ? [article, ...drafts] : drafts.map(draft => draft.draftId === article.draftId ? article : draft);
}

export function removeDraft(drafts, draftId) {
  return drafts.filter(draft => draft.draftId !== draftId);
}

export function pendingKey(repository, path) {
  return `${repository}:${path}`;
}

export function savePending(pending, repository, article, content) {
  const key = pendingKey(repository, article.file);
  if (content === article.content) {
    const next = { ...pending };
    delete next[key];
    return next;
  }
  return { ...pending, [key]: { path: article.file, sha: article.sha, content, title: article.title, savedAt: new Date().toISOString() } };
}
