import site from "./index.js";
import { verifyAccess } from "./access.js";
import { githubSettingsApi } from "./github-settings.js";
import { imageHostApi } from "./image-host.js";

export default {
  async fetch(request, env) {
    if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
      return new Response("Access is not configured", { status: 503 });
    }
    if (!await verifyAccess(request, env)) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (new URL(request.url).pathname.startsWith("/api/github/")) return githubSettingsApi(request, env);
    if (new URL(request.url).pathname.startsWith("/api/images/")) return imageHostApi(request, env);
    if (new URL(request.url).pathname.startsWith("/api/")) return new Response("API is not configured", { status: 503 });
    return site.fetch(request, env);
  },
};
