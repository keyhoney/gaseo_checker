import type { AnalyzeState } from "@/lib/types";

export type AnalyzeEvent =
  | "SUBMIT_URL"
  | "VALIDATION_PASS"
  | "VALIDATION_FAIL"
  | "API_SUCCESS_OK"
  | "API_SUCCESS_DEGRADED"
  | "API_FAILED"
  | "SIMULATE_SCORE"
  | "SIMULATION_SUCCESS"
  | "SIMULATION_FAILED"
  | "HISTORY_LOADED"
  | "RESET";

const TRANSITION_MAP: Record<
  AnalyzeState,
  Partial<Record<AnalyzeEvent, AnalyzeState>>
> = {
  idle: { SUBMIT_URL: "validating", RESET: "idle" },
  validating: {
    VALIDATION_PASS: "analyzing",
    VALIDATION_FAIL: "error_failed",
    RESET: "idle",
  },
  analyzing: {
    API_SUCCESS_OK: "success_ok",
    API_SUCCESS_DEGRADED: "success_degraded",
    API_FAILED: "error_failed",
    RESET: "idle",
  },
  success_ok: {
    RESET: "idle",
    SUBMIT_URL: "validating",
    SIMULATE_SCORE: "simulating",
    HISTORY_LOADED: "history_ready",
  },
  success_degraded: {
    RESET: "idle",
    SUBMIT_URL: "validating",
    SIMULATE_SCORE: "simulating",
    HISTORY_LOADED: "history_ready",
  },
  history_ready: {
    RESET: "idle",
    SUBMIT_URL: "validating",
    SIMULATE_SCORE: "simulating",
  },
  simulating: {
    SIMULATION_SUCCESS: "success_ok",
    SIMULATION_FAILED: "success_ok",
    RESET: "idle",
  },
  error_failed: { RESET: "idle", SUBMIT_URL: "validating" },
};

export function nextAnalyzeState(
  current: AnalyzeState,
  event: AnalyzeEvent,
): AnalyzeState {
  return TRANSITION_MAP[current][event] ?? current;
}
