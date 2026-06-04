import { createHash, createHmac } from "node:crypto";

// Huawei Cloud "SDK-HMAC-SHA256" AK/SK request signer.
// https://support.huaweicloud.com/intl/en-us/devg-apisign/api-sign-algorithm.html

function sha256hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
function sdkDate(): string {
  // ISO basic, e.g. 20260604T021530Z
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

export async function huaweiGet<T>(opts: {
  url: string; // full https URL, path must end with content or have query
  accessKey: string;
  secretKey: string;
}): Promise<T> {
  const u = new URL(opts.url);
  const host = u.host;
  const date = sdkDate();

  // Canonical query string: sorted, percent-encoded.
  const params = [...u.searchParams.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const canonicalQuery = params
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const payloadHash = sha256hex(""); // GET, empty body
  const signedHeaders = "host;x-sdk-date";
  const canonicalHeaders = `host:${host}\nx-sdk-date:${date}\n`;
  const canonicalRequest = [
    "GET",
    u.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = ["SDK-HMAC-SHA256", date, sha256hex(canonicalRequest)].join(
    "\n",
  );
  const signature = createHmac("sha256", opts.secretKey)
    .update(stringToSign, "utf8")
    .digest("hex");
  const authorization =
    `SDK-HMAC-SHA256 Access=${opts.accessKey}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(opts.url, {
    headers: { "X-Sdk-Date": date, Authorization: authorization, Host: host },
  });
  if (!res.ok) throw new Error(`Huawei ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}
