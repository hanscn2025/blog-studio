export const articleSelectionKey = article => article.file || "__current_draft__";
export const selectPublishableArticles = (articles, selected) => articles.filter(article => (!article.status || article.status === "草稿") && selected.includes(articleSelectionKey(article)));
