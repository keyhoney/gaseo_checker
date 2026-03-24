export interface LogEvent {
  timestamp: string;
  level: "info" | "warn" | "error";
  event: string;
  code?: string;
  host?: string;
  requestId?: string;
  policyStop?: boolean;
}

export function writeLog(event: LogEvent) {
  // 운영 로그 최소화: URL 전체/본문 등 민감 데이터는 기록하지 않음
  if (event.level === "info" && process.env.LOG_LEVEL === "warn") {
    return;
  }
  const line = JSON.stringify(event);
  // eslint-disable-next-line no-console
  console.log(line);
}
