"use client";

import { useMemo, useState } from "react";
import { nextAnalyzeState } from "@/lib/analyzeMachine";
import { ERROR_MESSAGES } from "@/lib/errors";
import { compareHistory, mergeHistory, toHistoryItem, type HistoryItem, type RegressionResult } from "@/lib/history";
import { createShareLink } from "@/lib/share";
import type {
  AnalyzeResponseEnvelope,
  AnalyzeState,
  Platform,
  SimulateScoreResponse,
} from "@/lib/types";
import { SUPPORTED_PLATFORMS } from "@/lib/types";
import { validateAnalyzeInput } from "@/lib/urlValidation";

const PLATFORM_LABELS: Record<Platform, string> = {
  naver: "네이버 블로그",
  tistory: "티스토리",
  blogspot: "블로그스팟",
};

export default function HomePage() {
  const [platform, setPlatform] = useState<Platform>("naver");
  const [url, setUrl] = useState("");
  const [state, setState] = useState<AnalyzeState>("idle");
  const [errorCode, setErrorCode] = useState<keyof typeof ERROR_MESSAGES | null>(
    null,
  );
  const [response, setResponse] = useState<AnalyzeResponseEnvelope | null>(null);
  const [activeTab, setActiveTab] = useState<"seo" | "aeo" | "geo" | "dia" | "cwv">("seo");
  const [selectedActions, setSelectedActions] = useState<Record<string, boolean>>({});
  const [simulation, setSimulation] = useState<SimulateScoreResponse | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [regression, setRegression] = useState<RegressionResult | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareMode, setShareMode] = useState<"normal" | "warning" | "minimal" | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<{ start: number; end: number } | null>(null);

  const isBusy = state === "validating" || state === "analyzing";
  const stateHint = useMemo(() => {
    if (state === "idle") return "대기 중";
    if (state === "validating") return "URL 검증 중";
    if (state === "analyzing") return "분석 요청 중";
    if (state === "simulating") return "점수 시뮬레이션 중";
    if (state === "success_ok") return "완전 성공";
    if (state === "success_degraded") return "부분 성공";
    if (state === "history_ready") return "히스토리 준비 완료";
    return "실패";
  }, [state]);
  const inpNote = response?.data?.webVitals.lab.inp?.note;
  const aeoConfidence = response?.data?.aeo.confidence ?? 0;
  const geoConfidence = response?.data?.geo.confidence ?? 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState((prev) => nextAnalyzeState(prev, "SUBMIT_URL"));
    setErrorCode(null);
    setResponse(null);

    const validation = validateAnalyzeInput({ platform, url });
    if (!validation.ok) {
      setErrorCode(validation.error.code);
      setState((prev) => nextAnalyzeState(prev, "VALIDATION_FAIL"));
      return;
    }

    setState((prev) => nextAnalyzeState(prev, "VALIDATION_PASS"));

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, url }),
    });
    const json = (await res.json()) as AnalyzeResponseEnvelope;
    setResponse(json);

    if (!res.ok || json.error) {
      if (json.error) {
        setErrorCode(json.error.code);
      }
      setState((prev) => nextAnalyzeState(prev, "API_FAILED"));
      return;
    }
    if (json.data?.status === "success_degraded" || (json.partialErrors?.length ?? 0) > 0) {
      setState((prev) => nextAnalyzeState(prev, "API_SUCCESS_DEGRADED"));
    } else {
      setState((prev) => nextAnalyzeState(prev, "API_SUCCESS_OK"));
    }

    if (json.data) {
      const key = `analysis:${json.data.platform}:${json.data.normalizedUrl}`;
      const current = toHistoryItem(json.data);
      const raw = localStorage.getItem(key);
      const prevItems = raw ? (JSON.parse(raw) as HistoryItem[]) : [];
      const merged = mergeHistory(prevItems, current);
      localStorage.setItem(key, JSON.stringify(merged));
      setHistoryItems(merged);
      setRegression(compareHistory(prevItems[0] ?? null, current));
      setState((prev) => nextAnalyzeState(prev, "HISTORY_LOADED"));
      setShareUrl(null);
      setShareMode(null);
    }
  }

  async function onSimulate() {
    if (!response?.data) return;
    const selected = Object.entries(selectedActions)
      .filter(([, v]) => v)
      .map(([id]) => ({ id, expectedStatus: "pass" as const }));
    if (selected.length === 0) return;

    setState((prev) => nextAnalyzeState(prev, "SIMULATE_SCORE"));
    const start = performance.now();
    try {
      const res = await fetch("/api/simulate-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: response.data.platform,
          url: response.data.normalizedUrl,
          baseScores: {
            seo: response.data.seo.score,
            aeo: response.data.aeo.score,
            geo: response.data.geo.score,
            cwv: response.data.webVitals.confidence * 100,
          },
          selectedActions: selected,
        }),
      });
      const json = (await res.json()) as SimulateScoreResponse;
      setSimulation(json);
      if (performance.now() - start <= 1000) {
        // local dev 기준 1초 내 반영 확인용 표시 목적
      }
      setState((prev) => nextAnalyzeState(prev, "SIMULATION_SUCCESS"));
    } catch {
      setState((prev) => nextAnalyzeState(prev, "SIMULATION_FAILED"));
    }
  }

  function onCreateShareLink() {
    if (!response?.data) return;
    const created = createShareLink(window.location.origin, response.data, regression);
    setShareUrl(created.url);
    setShareMode(created.mode);
  }

  const previewText = response?.data?.parsed.bodyText ?? "";
  const beforePreview = activeHighlight ? previewText.slice(0, activeHighlight.start) : previewText;
  const markPreview = activeHighlight ? previewText.slice(activeHighlight.start, activeHighlight.end) : "";
  const afterPreview = activeHighlight ? previewText.slice(activeHighlight.end) : "";

  return (
    <main>
      <h1>블로그 분석기 (6단계 UI)</h1>
      <p>결과 탭/상태 표시/시뮬레이션</p>

      <div className="card">
        <form className="grid" onSubmit={onSubmit}>
          <div>
            <label htmlFor="platform">플랫폼</label>
            <select
              id="platform"
              value={platform}
              disabled={isBusy}
              onChange={(e) => setPlatform(e.target.value as Platform)}
            >
              {SUPPORTED_PLATFORMS.map((item) => (
                <option key={item} value={item}>
                  {PLATFORM_LABELS[item]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="url">URL</label>
            <input
              id="url"
              type="text"
              placeholder="https://blog.naver.com/..."
              value={url}
              disabled={isBusy}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <button type="submit" disabled={isBusy}>
            분석 시작
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <p>
          현재 상태: <span className="code">{state}</span> ({stateHint})
        </p>
        {errorCode && (
          <p>
            오류 코드: <span className="code">{errorCode}</span> /{" "}
            {ERROR_MESSAGES[errorCode]}
          </p>
        )}
        {response && (
          <>
            {inpNote === "lab" && <p>INP는 참고용(Lab) 지표입니다.</p>}
            {response.data && (
              <>
                <div className="row">
                  <button className={`tab ${activeTab === "seo" ? "active" : ""}`} onClick={() => setActiveTab("seo")}>SEO</button>
                  <button className={`tab ${activeTab === "aeo" ? "active" : ""}`} onClick={() => setActiveTab("aeo")}>AEO</button>
                  <button className={`tab ${activeTab === "geo" ? "active" : ""}`} onClick={() => setActiveTab("geo")}>GEO</button>
                  <button className={`tab ${activeTab === "dia" ? "active" : ""}`} onClick={() => setActiveTab("dia")}>DIA/EEAT</button>
                  <button className={`tab ${activeTab === "cwv" ? "active" : ""}`} onClick={() => setActiveTab("cwv")}>CWV</button>
                </div>
                <div style={{ marginTop: 10 }}>
                  {(aeoConfidence < 0.7 || geoConfidence < 0.7) && (
                    <p>
                      신뢰도 하한 경고: AEO/GEO 신뢰도가 낮아 점수보다 체크리스트 근거를 우선 확인해 주세요.
                    </p>
                  )}
                  {(aeoConfidence < 0.6 || geoConfidence < 0.6) && (
                    <p>
                      예측 해석 주의: 신뢰도 0.60 미만 영역이 포함되어 결과 해석 시 주의가 필요합니다.
                    </p>
                  )}
                  {activeTab === "seo" && (
                    <>
                      <p>SEO 점수: {response.data.seo.score} / 신뢰도: {response.data.seo.confidence}</p>
                      {response.data.seo.items.map((item) => (
                        <label key={item.id} style={{ display: "block" }}>
                          <input
                            type="checkbox"
                            checked={Boolean(selectedActions[item.id])}
                            onChange={(e) =>
                              setSelectedActions((prev) => ({ ...prev, [item.id]: e.target.checked }))
                            }
                          />{" "}
                          [{item.status}] {item.id} - {item.message}
                          {item.highlights && item.highlights.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setActiveHighlight({
                                  start: item.highlights?.[0]?.startOffset ?? 0,
                                  end: item.highlights?.[0]?.endOffset ?? 0,
                                })
                              }
                              style={{ marginLeft: 8 }}
                            >
                              하이라이트 보기
                            </button>
                          )}
                        </label>
                      ))}
                    </>
                  )}
                  {activeTab === "aeo" && <p>AEO 점수: {response.data.aeo.score} / 신뢰도: {response.data.aeo.confidence}</p>}
                  {activeTab === "geo" && <p>GEO 점수: {response.data.geo.score} / 신뢰도: {response.data.geo.confidence}</p>}
                  {activeTab === "dia" && (
                    <p>
                      DIA: {response.data.searchQuality.diaScore} / EEAT: {response.data.searchQuality.eeatScore}
                    </p>
                  )}
                  {activeTab === "cwv" && (
                    <p>
                      LCP: {response.data.webVitals.lab.lcp?.value ?? "null"}s / INP:{" "}
                      {response.data.webVitals.lab.inp?.value ?? "null"}ms / CLS:{" "}
                      {response.data.webVitals.lab.cls?.value ?? "null"}
                    </p>
                  )}
                </div>
                <div style={{ marginTop: 10 }}>
                  <button type="button" onClick={onSimulate}>선택 항목 점수 시뮬레이션</button>
                </div>
                {simulation && (
                  <p style={{ marginTop: 8 }}>
                    예상 총점 변화: {simulation.before.total} → {simulation.after.total} ({simulation.delta.total >= 0 ? "+" : ""}
                    {simulation.delta.total})
                  </p>
                )}
                {regression && (
                  <p style={{ marginTop: 8 }}>
                    회귀 감지: {regression.trend} / 총점 변화 {regression.delta.total >= 0 ? "+" : ""}
                    {regression.delta.total}
                  </p>
                )}
                <div style={{ marginTop: 8 }}>
                  <button type="button" onClick={onCreateShareLink}>공유 링크 생성</button>
                </div>
                {shareUrl && (
                  <p style={{ marginTop: 8, wordBreak: "break-all" }}>
                    공유 링크: {shareUrl}
                  </p>
                )}
                {shareMode === "warning" && (
                  <p style={{ marginTop: 8 }}>
                    공유 링크 길이 경고 구간입니다(1801~3500). 일부 환경에서 열리지 않을 수 있습니다.
                  </p>
                )}
                {shareMode === "minimal" && (
                  <p style={{ marginTop: 8 }}>
                    길이 초과로 요약 공유 모드로 자동 축약되었습니다.
                  </p>
                )}
                {historyItems.length > 0 && (
                  <p style={{ marginTop: 8 }}>
                    로컬 히스토리: {historyItems.length}건 (최대 10건/30일)
                  </p>
                )}
                <div
                  style={{
                    marginTop: 12,
                    maxHeight: 120,
                    overflowY: "auto",
                    border: "1px solid #d1d5db",
                    padding: 8,
                    borderRadius: 8,
                    background: "#fff",
                  }}
                >
                  <strong>본문 미리보기</strong>
                  <p style={{ marginTop: 6 }}>
                    {beforePreview}
                    {activeHighlight && <mark>{markPreview}</mark>}
                    {afterPreview}
                  </p>
                </div>
              </>
            )}
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{JSON.stringify(response, null, 2)}</pre>
          </>
        )}
      </div>
      <p style={{ marginTop: 16, fontSize: 12, color: "#6b7280" }}>
        본 분석 결과는 참고용이며 검색 순위/성과를 보장하지 않습니다. 민감 주제(건강/금융/법률)는 전문가 검토를 권장합니다.
      </p>
    </main>
  );
}
