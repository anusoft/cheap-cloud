#!/usr/bin/env bun
// Best-effort: download each provider's raw region/location list from its
// official API into data/regions/<provider>.json — reference material behind the
// curated logical registry in regions.ts. Providers without an easy public or
// credentialed region API are skipped with a note (their codes are curated).
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tencentRequest } from "./sign/tencent.ts";
import { alibabaRpc } from "./sign/alibaba.ts";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "regions");

async function aws() {
  const idx = (await (
    await fetch(
      "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/region_index.json",
    )
  ).json()) as { regions: Record<string, { regionCode: string }> };
  return Object.entries(idx.regions).map(([label, v]) => ({
    code: v.regionCode,
    label,
  }));
}

async function hetzner() {
  const token = process.env.HETZNER_API_TOKEN;
  if (!token) throw new Error("HETZNER_API_TOKEN not set");
  const j = (await (
    await fetch("https://api.hetzner.cloud/v1/locations", {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()) as { locations: { name: string; city: string; country: string }[] };
  return j.locations.map((l) => ({ code: l.name, city: l.city, country: l.country }));
}

async function tencent() {
  if (!process.env.TENCENT_SECRET_ID) throw new Error("TENCENT creds not set");
  const r = await tencentRequest<{ RegionSet: { Region: string; RegionName: string }[] }>({
    service: "cvm", host: "cvm.tencentcloudapi.com", action: "DescribeRegions",
    version: "2017-03-12", region: "ap-singapore", payload: {},
    secretId: process.env.TENCENT_SECRET_ID!, secretKey: process.env.TENCENT_SECRET_KEY!,
  });
  return r.RegionSet.map((x) => ({ code: x.Region, label: x.RegionName }));
}

async function alibaba() {
  if (!process.env.ALIBABA_ACCESS_KEY_ID) throw new Error("ALIBABA creds not set");
  const r = await alibabaRpc<{ Regions: { Region: { RegionId: string; LocalName: string }[] } }>({
    endpoint: "ecs.ap-southeast-1.aliyuncs.com", action: "DescribeRegions", version: "2014-05-26",
    params: { AcceptLanguage: "en-US" },
    accessKeyId: process.env.ALIBABA_ACCESS_KEY_ID!, accessKeySecret: process.env.ALIBABA_ACCESS_KEY_SECRET!,
  });
  return r.Regions.Region.map((x) => ({ code: x.RegionId, label: x.LocalName }));
}

const SOURCES: Record<string, () => Promise<unknown>> = { aws, hetzner, tencent, alibaba };

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const [name, fn] of Object.entries(SOURCES)) {
    try {
      const list = await fn();
      await Bun.write(join(OUT, `${name}.json`), JSON.stringify(list, null, 2));
      console.log(`  ✓ ${name.padEnd(8)} ${(list as unknown[]).length} regions`);
    } catch (e) {
      console.log(`  ⏭ ${name.padEnd(8)} ${(e as Error).message}`);
    }
  }
  console.log(
    "\nNote: GCP/Azure/Huawei region lists need their own APIs; their codes are " +
      "curated in regions.ts. Raw dumps written to data/regions/.",
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
