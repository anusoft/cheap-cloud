import type { ProviderFetcher } from "../types.ts";
import { awsFetcher } from "./aws.ts";
import { azureFetcher } from "./azure.ts";
import { gcpFetcher } from "./gcp.ts";
import { alibabaFetcher } from "./alibaba.ts";
import { tencentFetcher } from "./tencent.ts";
import { huaweiFetcher } from "./huawei.ts";
import { hetznerFetcher } from "./hetzner.ts";

export const FETCHERS: ProviderFetcher[] = [
  awsFetcher,
  gcpFetcher,
  azureFetcher,
  alibabaFetcher,
  tencentFetcher,
  huaweiFetcher,
  hetznerFetcher,
];
