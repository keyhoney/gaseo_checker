interface PsiRunMetrics {
  lcpSec: number | null;
  inpMs: number | null;
  cls: number | null;
  fieldLcpMs: number | null;
  fieldInpMs: number | null;
  fieldCls: number | null;
}

export interface PsiResult {
  measurementPolicy: {
    runs: 3;
    aggregation: "median";
    highVariance: boolean;
  };
  lab: {
    lcp: { value: number; unit: "s" } | null;
    inp: { value: number; unit: "ms"; note: "lab" } | null;
    cls: { value: number } | null;
  };
  field: {
    lcp: { value: number; unit: "ms" } | null;
    inp: { value: number; unit: "ms" } | null;
    cls: { value: number } | null;
  };
  confidence: number;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function pickNumber(values: Array<number | null>): number | null {
  return median(values.filter((v): v is number => typeof v === "number"));
}

function parsePsiPayload(payload: any): PsiRunMetrics {
  const audits = payload?.lighthouseResult?.audits ?? {};
  const loadingMetrics = payload?.loadingExperience?.metrics ?? {};
  const originMetrics = payload?.originLoadingExperience?.metrics ?? {};
  const mergedField = { ...originMetrics, ...loadingMetrics };

  const lcpMs = audits["largest-contentful-paint"]?.numericValue;
  const inpMs = audits["interaction-to-next-paint"]?.numericValue;
  const cls = audits["cumulative-layout-shift"]?.numericValue;

  const fieldLcpMs = mergedField?.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null;
  const fieldInpMs = mergedField?.INTERACTION_TO_NEXT_PAINT?.percentile ?? null;
  const fieldClsRaw = mergedField?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? null;
  const fieldCls = typeof fieldClsRaw === "number" ? Number((fieldClsRaw / 100).toFixed(3)) : null;

  return {
    lcpSec: typeof lcpMs === "number" ? Number((lcpMs / 1000).toFixed(2)) : null,
    inpMs: typeof inpMs === "number" ? Math.round(inpMs) : null,
    cls: typeof cls === "number" ? Number(cls.toFixed(3)) : null,
    fieldLcpMs: typeof fieldLcpMs === "number" ? Math.round(fieldLcpMs) : null,
    fieldInpMs: typeof fieldInpMs === "number" ? Math.round(fieldInpMs) : null,
    fieldCls,
  };
}

function calcHighVariance(runs: PsiRunMetrics[]): boolean {
  const lcp = runs.map((r) => r.lcpSec).filter((v): v is number => v !== null);
  const inp = runs.map((r) => r.inpMs).filter((v): v is number => v !== null);
  const cls = runs.map((r) => r.cls).filter((v): v is number => v !== null);
  const range = (arr: number[]) => (arr.length ? Math.max(...arr) - Math.min(...arr) : 0);
  return range(lcp) > 0.8 || range(inp) > 120 || range(cls) > 0.08;
}

export async function fetchPsiWebVitals(
  url: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PsiResult> {
  const endpoint = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
  const runs: PsiRunMetrics[] = [];

  for (let i = 0; i < 3; i += 1) {
    const query = new URLSearchParams({
      url,
      strategy: "mobile",
      category: "performance",
      key: apiKey,
    });
    const res = await fetchImpl(`${endpoint}?${query.toString()}`);
    if (!res.ok) throw new Error(`PSI_HTTP_${res.status}`);
    const payload = await res.json();
    runs.push(parsePsiPayload(payload));
  }

  const lcp = pickNumber(runs.map((r) => r.lcpSec));
  const inp = pickNumber(runs.map((r) => r.inpMs));
  const cls = pickNumber(runs.map((r) => r.cls));
  const fieldLcp = pickNumber(runs.map((r) => r.fieldLcpMs));
  const fieldInp = pickNumber(runs.map((r) => r.fieldInpMs));
  const fieldCls = pickNumber(runs.map((r) => r.fieldCls));
  const presentLabCount = [lcp, inp, cls].filter((v) => v !== null).length;

  return {
    measurementPolicy: {
      runs: 3,
      aggregation: "median",
      highVariance: calcHighVariance(runs),
    },
    lab: {
      lcp: lcp === null ? null : { value: lcp, unit: "s" },
      inp: inp === null ? null : { value: inp, unit: "ms", note: "lab" },
      cls: cls === null ? null : { value: cls },
    },
    field: {
      lcp: fieldLcp === null ? null : { value: fieldLcp, unit: "ms" },
      inp: fieldInp === null ? null : { value: fieldInp, unit: "ms" },
      cls: fieldCls === null ? null : { value: fieldCls },
    },
    confidence: Number((presentLabCount / 3).toFixed(2)),
  };
}
