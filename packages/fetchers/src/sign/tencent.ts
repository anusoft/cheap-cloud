import { createHash, createHmac } from "node:crypto";

// Tencent Cloud TC3-HMAC-SHA256 request signer.
// https://www.tencentcloud.com/document/product/213/33224

function sha256hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

export async function tencentRequest<T>(opts: {
  service: string; // "cvm"
  host: string; // "cvm.tencentcloudapi.com"
  action: string; // "DescribeZoneInstanceConfigInfos"
  version: string; // "2017-03-12"
  region: string; // "ap-bangkok"
  payload: unknown;
  secretId: string;
  secretKey: string;
}): Promise<T> {
  const body = JSON.stringify(opts.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const ct = "application/json; charset=utf-8";

  const canonicalHeaders = `content-type:${ct}\nhost:${opts.host}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256hex(body),
  ].join("\n");

  const scope = `${date}/${opts.service}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    scope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const secretDate = hmac(`TC3${opts.secretKey}`, date);
  const secretService = hmac(secretDate, opts.service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = createHmac("sha256", secretSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  const authorization =
    `TC3-HMAC-SHA256 Credential=${opts.secretId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${opts.host}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": ct,
      Host: opts.host,
      "X-TC-Action": opts.action,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Version": opts.version,
      "X-TC-Region": opts.region,
    },
    body,
  });
  const json = (await res.json()) as { Response?: T & { Error?: { Code: string; Message: string } } };
  const r = json.Response;
  if (!r) throw new Error(`Tencent: empty response`);
  if ((r as any).Error)
    throw new Error(
      `Tencent ${(r as any).Error.Code}: ${(r as any).Error.Message}`,
    );
  return r as T;
}
