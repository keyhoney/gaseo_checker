import { NextResponse } from "next/server";
import { getAnalyzeProgress } from "@/lib/analyzeProgress";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const progressId = searchParams.get("id");
  if (!progressId) {
    return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
  }

  const progress = getAnalyzeProgress(progressId);
  if (!progress) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(progress, { status: 200 });
}
