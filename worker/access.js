const decoder = new TextDecoder();
const decode = value => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), character => character.charCodeAt(0));

export async function verifyAccess(request, env, get = fetch) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const team = new URL(env.ACCESS_TEAM_DOMAIN);
  if (team.protocol !== "https:" || !team.hostname.endsWith(".cloudflareaccess.com") || team.pathname !== "/") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(decoder.decode(decode(parts[0])));
    const payload = JSON.parse(decoder.decode(decode(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "RS256" || !header.kid || payload.iss !== team.origin || ![].concat(payload.aud || []).includes(env.ACCESS_AUD) || payload.exp <= now || payload.nbf > now) return null;
    const response = await get(`${team.origin}/cdn-cgi/access/certs`);
    if (!response.ok) return null;
    const { keys } = await response.json();
    const jwk = keys?.find(key => key.kid === header.kid && key.kty === "RSA");
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    return valid ? payload : null;
  } catch {
    return null;
  }
}
