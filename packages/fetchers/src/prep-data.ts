#!/usr/bin/env bun
// Copies per-region snapshots into the web app's public/data and writes the
// region index (public/data/regions.json) the selector reads. Run before
// `vite dev` / `vite build` so the static site has its data bundled.
import { mkdir, readdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { listRegions } from "./regions.ts";
import type { ProviderId } from "@cheap-cloud/schema";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "data");
const OUT = join(HERE, "..", "..", "..", "apps", "web", "public", "data");

async function main() {
  await mkdir(OUT, { recursive: true });

  // Which region snapshots actually exist on disk (stable <key>.json files).
  const onDisk = new Set(
    (existsSync(DATA) ? await readdir(DATA) : [])
      .filter((f) => /^[a-z0-9-]+\.json$/.test(f) && f !== "latest.json")
      .map((f) => f.replace(/\.json$/, "")),
  );

  const index = listRegions().map((r) => {
    const hasData = onDisk.has(r.key);
    const providers = Object.keys(r.providerRegions) as ProviderId[];
    return {
      key: r.key,
      label: r.label,
      city: r.city,
      country: r.country,
      countryCode: r.countryCode,
      flag: r.flag,
      enabled: r.enabled,
      hasData,
      providers,
      providerRegions: r.providerRegions,
    };
  });

  let copied = 0;
  for (const r of index) {
    if (r.hasData) {
      await copyFile(join(DATA, `${r.key}.json`), join(OUT, `${r.key}.json`));
      copied++;
    }
  }

  await Bun.write(join(OUT, "regions.json"), JSON.stringify(index, null, 2));
  console.log(
    `▸ prep-data: ${copied} region snapshot(s) copied, ${index.length} regions indexed → apps/web/public/data/`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
