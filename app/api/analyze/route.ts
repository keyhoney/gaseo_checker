import { NextResponse } from "next/server";
import type { AnalyzeRequest } from "@/lib/types";
import { ERROR_MESSAGES } from "@/lib/errors";
import { writeLog } from "@/lib/logger";
import { getOpsSnapshot, recordAnalyzeResult } from "@/lib/opsMonitor";
import { evaluateRateLimit } from "@/lib/rateLimit";
import { analyzeRequest } from "@/lib/analyzeService";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const requestId = crypto.randomUUID();
  const host = (() => {
    try {
      const bodyHost = req.headers.get("host") ?? "";
      return bodyHost || "unknown";
    } catch {
      return "unknown";
    }
  })();
  const key = `analyze:${ip}`;
  const limit = evaluateRateLimit(key);
  if (!limit.allowed) {
    const timestamp = new Date().toISOString();
    writeLog({
      timestamp,
      level: "warn",
      event: "rate_limited",
      code: "RATE_LIMITED",
      host,
      requestId,
      policyStop: limit.policyStop,
    });
    return NextResponse.json(
      {
        requestId,
        timestamp,
        data: null,
        partialErrors: [],
        error: {
          code: "RATE_LIMITED",
          message: ERROR_MESSAGES.RATE_LIMITED,
          retryable: true,
          policyStop: limit.policyStop,
        },
      },
      {
        status: 429,
        headers: {
          "retry-after": `${limit.retryAfterSec}`,
        },
      },
    );
  }

  let body: AnalyzeRequest | null = null;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    body = null;
  }
  try {
    const result = await analyzeRequest(body);
    const platform = body?.platform ?? "unknown";
    recordAnalyzeResult({
      platform,
      parseFailed: result.response.error?.code === "PARSE_FAILED",
      fallbackDepth: result.response.data?.parsed.parserMeta.fallbackDepth,
      noiseBlocksRemoved: result.response.data?.parsed.parserMeta.noiseBlocksRemoved,
    });
    if (result.response.error) {
      writeLog({
        timestamp: new Date().toISOString(),
        level: "warn",
        event: "analyze_error",
        code: result.response.error.code,
        host,
        requestId: result.response.requestId,
      });
    }
    return NextResponse.json(
      {
        ...result.response,
        ops: getOpsSnapshot(platform),
      },
      { status: result.status },
    );
  } catch {
    writeLog({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "internal_error",
      code: "INTERNAL_ERROR",
      host,
      requestId,
    });
    return NextResponse.json(
      {
        requestId,
        timestamp: new Date().toISOString(),
        data: null,
        partialErrors: [],
        error: {
          code: "INTERNAL_ERROR",
          message: ERROR_MESSAGES.INTERNAL_ERROR,
          retryable: true,
        },
      },
      { status: 500 },
    );
  }
}
