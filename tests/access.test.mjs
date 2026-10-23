import assert from "node:assert/strict";
import { generateKeyPairSync, sign, webcrypto } from "node:crypto";
import test from "node:test";
import { verifyAccess } from "../worker/access.js";

globalThis.crypto ||= webcrypto;
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
const env = { ACCESS_TEAM_DOMAIN: "https://example.cloudflareaccess.com", ACCESS_AUD: "app-aud" };
const b64 = value => Buffer.from(JSON.stringify(value)).toString("base64url");
function request(claims = {}) {
  const payload = { iss: env.ACCESS_TEAM_DOMAIN, aud: [env.ACCESS_AUD], exp: Math.floor(Date.now() / 1000) + 60, ...claims };
  const data = `${b64({ alg: "RS256", kid: "test-key" })}.${b64(payload)}`;
  const jwt = `${data}.${sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url")}`;
  return new Request("https://admin.example.test", { headers: { "Cf-Access-Jwt-Assertion": jwt } });
}
const certs = async () => Response.json({ keys: [jwk] });

test("accepts a signed Access token for the configured app", async () => {
  assert.equal((await verifyAccess(request({ email: "owner@example.test" }), env, certs)).email, "owner@example.test");
});

test("rejects absent, wrong-audience and tampered Access tokens", async () => {
  assert.equal(await verifyAccess(new Request("https://admin.example.test"), env, certs), null);
  assert.equal(await verifyAccess(request({ aud: ["other"] }), env, certs), null);
  const original = request().headers.get("Cf-Access-Jwt-Assertion");
  const [header, payload, signature] = original.split(".");
  const changedPayload = b64({ ...JSON.parse(Buffer.from(payload, "base64url")), extra: "forged" });
  const tampered = new Request("https://admin.example.test", { headers: { "Cf-Access-Jwt-Assertion": `${header}.${changedPayload}.${signature}` } });
  assert.equal(await verifyAccess(tampered, env, certs), null);
});
