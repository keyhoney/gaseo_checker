type AnalyzeProgressStage = "validate" | "fetch" | "parse" | "rules" | "ai";
type AnalyzeProgressStatus = "running" | "done" | "error";

interface AnalyzeProgressState {
  stage: AnalyzeProgressStage;
  status: AnalyzeProgressStatus;
  updatedAt: number;
}

const progressStore = new Map<string, AnalyzeProgressState>();
const TTL_MS = 5 * 60 * 1000;

function cleanupExpired() {
  const now = Date.now();
  for (const [key, value] of progressStore.entries()) {
    if (now - value.updatedAt > TTL_MS) {
      progressStore.delete(key);
    }
  }
}

export function startAnalyzeProgress(progressId: string) {
  cleanupExpired();
  progressStore.set(progressId, {
    stage: "validate",
    status: "running",
    updatedAt: Date.now(),
  });
}

export function updateAnalyzeProgress(progressId: string, stage: AnalyzeProgressStage) {
  cleanupExpired();
  progressStore.set(progressId, {
    stage,
    status: "running",
    updatedAt: Date.now(),
  });
}

export function finishAnalyzeProgress(progressId: string, status: Exclude<AnalyzeProgressStatus, "running">) {
  cleanupExpired();
  const prev = progressStore.get(progressId);
  progressStore.set(progressId, {
    stage: prev?.stage ?? "ai",
    status,
    updatedAt: Date.now(),
  });
}

export function getAnalyzeProgress(progressId: string) {
  cleanupExpired();
  return progressStore.get(progressId) ?? null;
}
