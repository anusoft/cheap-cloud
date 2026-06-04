import { createHmac, randomUUID } from "node:crypto";

// Alibaba Cloud RPC-style API signer (SignatureVersion 1.0, HMAC-SHA1).
// https://www.alibabacloud.com/help/en/sdk/product-overview/rpc-mechanism

// RFC3986 percent-encoding as required by Alibaba's signing.
function percentEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

export async function alibabaRpc<T>(opts: {
  endpoint: string; // ecs.ap-southeast-7.aliyuncs.com
  action: string;
  version: string; // ECS: 2014-05-26
  params: Record<string, string>;
  accessKeyId: string;
  accessKeySecret: string;
}): Promise<T> {
  const common: Record<string, string> = {
    Format: "JSON",
    Version: opts.version,
    AccessKeyId: opts.accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    SignatureNonce: randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    Action: opts.action,
    ...opts.params,
  };

  const sortedKeys = Object.keys(common).sort();
  const canonical = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(common[k]!)}`)
    .join("&");
  const stringToSign = `GET&${percentEncode("/")}&${percentEncode(canonical)}`;
  const signature = createHmac("sha1", `${opts.accessKeySecret}&`)
    .update(stringToSign, "utf8")
    .digest("base64");

  const url = `https://${opts.endpoint}/?${canonical}&Signature=${percentEncode(signature)}`;
  const res = await fetch(url);
  const json = (await res.json()) as T & { Code?: string; Message?: string };
  if (!res.ok || (json as any).Code) {
    throw new Error(
      `Alibaba ${opts.action} ${(json as any).Code ?? res.status}: ${(json as any).Message ?? ""}`,
    );
  }
  return json;
}
