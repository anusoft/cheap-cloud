#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyNormalization,
  InstancePrice,
  Snapshot,
  type ProviderId,
} from "@cheap-cloud/schema";
import { getRegion } from "./regions.ts";
import { FETCHERS } from "./providers/index.ts";
import type { FetchContext } from "./types.ts";

// ── arg parsing: --provider=all|aws,gcp --region=bangkok --out=<dir> ──────────
function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = arg("out", join(HERE, "..", "data"));
const regionKey = arg("region", "bangkok");
const providerArg = arg("provider", "all");

async function main() {
  const region = getRegion(regionKey);
  const fetchedAt = new Date().toISOString();

  const wanted =
    providerArg === "all"
      ? FETCHERS
      : FETCHERS.filter((f) => providerArg.split(",").includes(f.id));

  if (wanted.length === 0) {
    console.error(`No matching providers for "${providerArg}".`);
    process.exit(1);
  }

  console.log(`\n▸ Fetching ${region.label} (${regionKey})  ${fetchedAt}\n`);

  const contributed: ProviderId[] = [];
  const settled = await Promise.allSettled(
    wanted.map(async (f) => {
      const pr = region.providerRegions[f.id];
      if (!pr) {
        console.log(`  ⏭  ${f.label.padEnd(14)} no region mapping — skipped`);
        return [] as InstancePrice[];
      }
      const avail = f.available();
      if (!avail.ok) {
        console.log(`  ⏭  ${f.label.padEnd(14)} ${avail.reason}`);
        return [] as InstancePrice[];
      }
      const ctx: FetchContext = { region, providerRegion: pr, fetchedAt };
      const t0 = performance.now();
      const rows = await f.fetch(ctx);
      const ms = Math.round(performance.now() - t0);
      console.log(
        `  ✓  ${f.label.padEnd(14)} ${String(rows.length).padStart(4)} rows  (${pr.code}, ${ms}ms)`,
      );
      if (rows.length) contributed.push(f.id);
      return rows;
    }),
  );

  const rows: InstancePrice[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") rows.push(...s.value);
    else console.log(`  ✗  ${wanted[i]!.label.padEnd(14)} ${s.reason}`);
  });

  // Validate + back-fill normalized per-vCPU / per-GB rates.
  const validated = rows.flatMap((r) => {
    const parsed = InstancePrice.safeParse(r);
    if (!parsed.success) {
      console.log(`  ⚠  dropped invalid row ${r.id}: ${parsed.error.issues[0]?.message}`);
      return [];
    }
    return [parsed.data];
  });
  applyNormalization(validated);

  const snapshot: Snapshot = {
    schemaVersion: 1,
    regionKey,
    generatedAt: fetchedAt,
    providers: contributed,
    rows: validated,
  };
  Snapshot.parse(snapshot);

  await mkdir(DATA_DIR, { recursive: true });
  const date = fetchedAt.slice(0, 10);
  const json = JSON.stringify(snapshot, null, 2);
  const dated = join(DATA_DIR, `${regionKey}-${date}.json`);
  // Stable per-region file (what the web app & prep-data consume) + dated + latest.
  await Bun.write(dated, json);
  await Bun.write(join(DATA_DIR, `${regionKey}.json`), json);
  await Bun.write(join(DATA_DIR, "latest.json"), json);

  console.log(
    `\n▸ ${validated.length} rows from ${contributed.length} providers → ${dated}\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
