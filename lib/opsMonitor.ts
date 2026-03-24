interface Metrics {
  total: number;
  parseFailed: number;
  fallbackDepthSum: number;
  fallbackDepthCount: number;
  noiseBlocksRemovedSum: number;
  noiseObservedCount: number;
}

const metricsByPlatform = new Map<string, Metrics>();

function ensure(platform: string): Metrics {
  const current = metricsByPlatform.get(platform);
  if (current) return current;
  const next: Metrics = {
    total: 0,
    parseFailed: 0,
    fallbackDepthSum: 0,
    fallbackDepthCount: 0,
    noiseBlocksRemovedSum: 0,
    noiseObservedCount: 0,
  };
  metricsByPlatform.set(platform, next);
  return next;
}

export function recordAnalyzeResult(input: {
  platform: string;
  parseFailed: boolean;
  fallbackDepth?: number;
  noiseBlocksRemoved?: number;
}) {
  const m = ensure(input.platform);
  m.total += 1;
  if (input.parseFailed) m.parseFailed += 1;
  if (typeof input.fallbackDepth === "number") {
    m.fallbackDepthSum += input.fallbackDepth;
    m.fallbackDepthCount += 1;
  }
  if (typeof input.noiseBlocksRemoved === "number") {
    m.noiseBlocksRemovedSum += input.noiseBlocksRemoved;
    m.noiseObservedCount += 1;
  }
}

export function getOpsSnapshot(platform: string) {
  const m = ensure(platform);
  const parseFailureRate = m.total === 0 ? 0 : Number((m.parseFailed / m.total).toFixed(4));
  const fallbackDepthAvg =
    m.fallbackDepthCount === 0 ? 0 : Number((m.fallbackDepthSum / m.fallbackDepthCount).toFixed(2));
  const noiseRemovalRatio =
    m.noiseObservedCount === 0
      ? 0
      : Number((m.noiseBlocksRemovedSum / Math.max(m.total, 1)).toFixed(2));
  return {
    total: m.total,
    parseFailureRate,
    fallbackDepthAvg,
    noiseRemovalRatio,
    alerts: {
      parseFailureHigh: parseFailureRate > 0.05,
      fallbackDepthHigh: fallbackDepthAvg > 1.5,
      noiseShiftHigh: noiseRemovalRatio > 6,
    },
  };
}

export function __resetOpsMonitorForTest() {
  metricsByPlatform.clear();
}
