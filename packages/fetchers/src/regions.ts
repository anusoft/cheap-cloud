import type { ProviderId, Confidence } from "@cheap-cloud/schema";

export interface ProviderRegion {
  code: string;
  confidence: Confidence;
}

export interface Region {
  key: string; // "bangkok"
  label: string; // "Bangkok"
  city: string;
  country: string;
  countryCode: string; // ISO-3166 alpha-2
  flag: string; // emoji
  enabled: boolean; // selectable in the UI
  hasData: boolean; // a pricing snapshot ships for this region
  providerRegions: Partial<Record<ProviderId, ProviderRegion>>;
}

// Helper to keep the registry terse.
function pr(code: string, confidence: Confidence = "confirmed"): ProviderRegion {
  return { code, confidence };
}

// ─────────────────────────────────────────────────────────────────────────────
// Region registry. Bangkok is the region we ship pricing for today (hasData);
// the rest are wired so `bun fetch --region=<key>` works and the UI can offer
// the full selector. Each logical region maps to the per-provider region code
// available nearest that city; `proxy` flags a non-local fallback.
//
// Hetzner only has DCs in DE (Falkenstein/Nuremberg), FI (Helsinki), US
// (Ashburn/Hillsboro) and SG (Singapore) — so for Bangkok it appears only via
// its Singapore (sin) location, flagged proxy.
// ─────────────────────────────────────────────────────────────────────────────
export const REGIONS: Record<string, Region> = {
  bangkok: {
    key: "bangkok", label: "Bangkok", city: "Bangkok",
    country: "Thailand", countryCode: "TH", flag: "🇹🇭",
    enabled: true, hasData: true,
    providerRegions: {
      aws: pr("ap-southeast-7"),
      gcp: pr("asia-southeast3"),
      azure: pr("southeastasia", "proxy"), // no GA TH region
      alibaba: pr("ap-southeast-7"),
      tencent: pr("ap-bangkok"),
      huawei: pr("ap-southeast-2"),
      hetzner: pr("sin", "proxy"), // nearest DC is Singapore
    },
  },
  singapore: {
    key: "singapore", label: "Singapore", city: "Singapore",
    country: "Singapore", countryCode: "SG", flag: "🇸🇬",
    enabled: true, hasData: false,
    providerRegions: {
      aws: pr("ap-southeast-1"),
      gcp: pr("asia-southeast1"),
      azure: pr("southeastasia"),
      alibaba: pr("ap-southeast-1"),
      tencent: pr("ap-singapore"),
      huawei: pr("ap-southeast-3"),
      hetzner: pr("sin"),
    },
  },
  jakarta: {
    key: "jakarta", label: "Jakarta", city: "Jakarta",
    country: "Indonesia", countryCode: "ID", flag: "🇮🇩",
    enabled: true, hasData: false,
    providerRegions: {
      aws: pr("ap-southeast-3"),
      gcp: pr("asia-southeast2"),
      azure: pr("southeastasia", "proxy"),
      alibaba: pr("ap-southeast-5"),
      tencent: pr("ap-jakarta"),
    },
  },
  hongkong: {
    key: "hongkong", label: "Hong Kong", city: "Hong Kong",
    country: "Hong Kong SAR", countryCode: "HK", flag: "🇭🇰",
    enabled: true, hasData: false,
    providerRegions: {
      aws: pr("ap-east-1"),
      gcp: pr("asia-east2"),
      azure: pr("eastasia"),
      alibaba: pr("cn-hongkong"),
      tencent: pr("ap-hongkong"),
      huawei: pr("ap-southeast-1"),
    },
  },
  tokyo: {
    key: "tokyo", label: "Tokyo", city: "Tokyo",
    country: "Japan", countryCode: "JP", flag: "🇯🇵",
    enabled: true, hasData: false,
    providerRegions: {
      aws: pr("ap-northeast-1"),
      gcp: pr("asia-northeast1"),
      azure: pr("japaneast"),
      alibaba: pr("ap-northeast-1"),
      tencent: pr("ap-tokyo"),
    },
  },
  seoul: {
    key: "seoul", label: "Seoul", city: "Seoul",
    country: "South Korea", countryCode: "KR", flag: "🇰🇷",
    enabled: true, hasData: false,
    providerRegions: {
      aws: pr("ap-northeast-2"),
      gcp: pr("asia-northeast3"),
      azure: pr("koreacentral"),
      alibaba: pr("ap-northeast-2"),
      tencent: pr("ap-seoul"),
    },
  },
  mumbai: {
    key: "mumbai", label: "Mumbai", city: "Mumbai",
    country: "India", countryCode: "IN", flag: "🇮🇳",
    enabled: true, hasData: false,
    providerRegions: {
      aws: pr("ap-south-1"),
      gcp: pr("asia-south1"),
      azure: pr("centralindia", "proxy"),
      alibaba: pr("ap-south-1"),
      tencent: pr("ap-mumbai"),
    },
  },
  sydney: {
    key: "sydney", label: "Sydney", city: "Sydney",
    country: "Australia", countryCode: "AU", flag: "🇦🇺",
    enabled: true, hasData: false,
    providerRegions: {
      aws: pr("ap-southeast-2"),
      gcp: pr("australia-southeast1"),
      azure: pr("australiaeast"),
      alibaba: pr("ap-southeast-2"),
      tencent: pr("ap-sydney"),
    },
  },
  frankfurt: {
    key: "frankfurt", label: "Frankfurt", city: "Frankfurt",
    country: "Germany", countryCode: "DE", flag: "🇩🇪",
    enabled: true, hasData: false,
    providerRegions: {
      aws: pr("eu-central-1"),
      gcp: pr("europe-west3"),
      azure: pr("germanywestcentral"),
      alibaba: pr("eu-central-1"),
      tencent: pr("eu-frankfurt"),
      hetzner: pr("fsn1"), // Falkenstein, DE
    },
  },
  helsinki: {
    key: "helsinki", label: "Helsinki", city: "Helsinki",
    country: "Finland", countryCode: "FI", flag: "🇫🇮",
    enabled: true, hasData: false,
    providerRegions: {
      gcp: pr("europe-north1"),
      azure: pr("northeurope", "proxy"),
      hetzner: pr("hel1"),
    },
  },
  london: {
    key: "london", label: "London", city: "London",
    country: "United Kingdom", countryCode: "GB", flag: "🇬🇧",
    enabled: true, hasData: false,
    providerRegions: {
      aws: pr("eu-west-2"),
      gcp: pr("europe-west2"),
      azure: pr("uksouth"),
      alibaba: pr("eu-west-1"),
    },
  },
  virginia: {
    key: "virginia", label: "N. Virginia", city: "Ashburn",
    country: "United States", countryCode: "US", flag: "🇺🇸",
    enabled: true, hasData: false,
    providerRegions: {
      aws: pr("us-east-1"),
      gcp: pr("us-east4"),
      azure: pr("eastus"),
      alibaba: pr("us-east-1"),
      tencent: pr("na-ashburn"),
      hetzner: pr("ash"),
    },
  },
  oregon: {
    key: "oregon", label: "Oregon", city: "Hillsboro",
    country: "United States", countryCode: "US", flag: "🇺🇸",
    enabled: true, hasData: false,
    providerRegions: {
      aws: pr("us-west-2"),
      gcp: pr("us-west1"),
      azure: pr("westus2"),
      tencent: pr("na-siliconvalley", "proxy"),
      hetzner: pr("hil"),
    },
  },
  saopaulo: {
    key: "saopaulo", label: "São Paulo", city: "São Paulo",
    country: "Brazil", countryCode: "BR", flag: "🇧🇷",
    enabled: true, hasData: false,
    providerRegions: {
      aws: pr("sa-east-1"),
      gcp: pr("southamerica-east1"),
      azure: pr("brazilsouth"),
      tencent: pr("sa-saopaulo"),
    },
  },
};

export function getRegion(key: string): Region {
  const r = REGIONS[key];
  if (!r) {
    const known = Object.keys(REGIONS).join(", ");
    throw new Error(`Unknown region "${key}". Known regions: ${known}`);
  }
  return r;
}

export function listRegions(): Region[] {
  return Object.values(REGIONS);
}
