export function repositorySiteProfile(settings, navigation, articles) {
  const connected = !!settings.repository;
  return {
    engine: settings.site?.engine || "",
    template: settings.site?.template || "",
    channels: navigation.status === "detected" ? navigation.channels : [],
    categories: [...new Set(articles.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    usesCategories: settings.site?.engine === "hexo" || articles.some(item => item.category),
    connectionStatus: connected ? "connected" : "disconnected",
    repository: settings.repository || "",
  };
}
