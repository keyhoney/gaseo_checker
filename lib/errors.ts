import type { ErrorCode } from "@/lib/types";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_URL: "URL 형식이 올바르지 않습니다. 주소를 다시 확인해 주세요.",
  UNSUPPORTED_PLATFORM:
    "지원하지 않는 플랫폼입니다. 플랫폼을 다시 선택해 주세요.",
  PLATFORM_MISMATCH: "선택한 플랫폼과 URL 도메인이 일치하지 않습니다.",
  FETCH_FAILED: "페이지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
  PARSE_FAILED: "페이지 구조를 해석하지 못했습니다. 다른 글 URL로 시도해 주세요.",
  PSI_FAILED: "성능 지표를 가져오지 못했습니다. 기본 분석 결과만 제공합니다.",
  GEMINI_FAILED: "AI 인사이트를 생성하지 못했습니다. 규칙 기반 결과를 먼저 확인해 주세요.",
  RATE_LIMITED: "요청이 많아 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.",
  INTERNAL_ERROR: "서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};
