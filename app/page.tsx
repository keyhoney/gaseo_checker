"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const PLATFORM_PLACEHOLDERS: Record<Platform, string> = {
  naver: "https://blog.naver.com/아이디/게시글번호",
  tistory: "https://블로그이름.tistory.com/entry/슬러그",
  blogspot: "https://블로그이름.blogspot.com/2026/03/post.html",
};

const ANALYZE_PROGRESS_STEPS = [
  { id: "validate", label: "검증" },
  { id: "fetch", label: "수집" },
  { id: "parse", label: "파싱" },
  { id: "rules", label: "평가" },
  { id: "ai", label: "보강" },
] as const;
type AnalyzeProgressStageId = (typeof ANALYZE_PROGRESS_STEPS)[number]["id"];
type AnalyzeProgressStatus = "running" | "done" | "error";

function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const finalTarget = Number.isFinite(target) ? target : 0;
    const start = performance.now();

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setValue(finalTarget * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration]);

  return value;
}

function AnimatedMetric({
  label,
  value,
  suffix = "",
  digits = 1,
}: {
  label: string;
  value: number;
  suffix?: string;
  digits?: number;
}) {
  const animated = useCountUp(value);
  return (
    <p className="metric-line">
      {label}: <strong>{animated.toFixed(digits)}</strong>
      {suffix}
    </p>
  );
}

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
  const [progressStage, setProgressStage] = useState<AnalyzeProgressStageId>("validate");
  const [progressStatus, setProgressStatus] = useState<AnalyzeProgressStatus>("running");
  const progressPollRef = useRef<number | null>(null);

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
  const responseStatus = response?.data?.status;
  const statusClass =
    state === "error_failed"
      ? "error"
      : responseStatus === "success_ok"
        ? "ok"
        : responseStatus === "success_degraded"
          ? "degraded"
          : "";

  useEffect(() => {
    return () => {
      if (progressPollRef.current) {
        window.clearInterval(progressPollRef.current);
      }
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState((prev) => nextAnalyzeState(prev, "SUBMIT_URL"));
    setErrorCode(null);
    setResponse(null);
    setProgressStage("validate");
    setProgressStatus("running");

    const progressId = crypto.randomUUID();
    if (progressPollRef.current) {
      window.clearInterval(progressPollRef.current);
    }
    progressPollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/analyze-progress?id=${encodeURIComponent(progressId)}`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          stage: AnalyzeProgressStageId;
          status: AnalyzeProgressStatus;
        };
        setProgressStage(json.stage);
        setProgressStatus(json.status);
        if (json.status !== "running" && progressPollRef.current) {
          window.clearInterval(progressPollRef.current);
          progressPollRef.current = null;
        }
      } catch {
        // ignore transient polling errors
      }
    }, 300);

    const validation = validateAnalyzeInput({ platform, url });
    if (!validation.ok) {
      setErrorCode(validation.error.code);
      setState((prev) => nextAnalyzeState(prev, "VALIDATION_FAIL"));
      if (progressPollRef.current) {
        window.clearInterval(progressPollRef.current);
        progressPollRef.current = null;
      }
      return;
    }

    setState((prev) => nextAnalyzeState(prev, "VALIDATION_PASS"));

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-progress-id": progressId,
      },
      body: JSON.stringify({ platform, url }),
    });
    const json = (await res.json()) as AnalyzeResponseEnvelope;
    setResponse(json);
    setProgressStatus(json.error ? "error" : "done");

    if (!res.ok || json.error) {
      if (json.error) {
        setErrorCode(json.error.code);
      }
      if (progressPollRef.current) {
        window.clearInterval(progressPollRef.current);
        progressPollRef.current = null;
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
    if (progressPollRef.current) {
      window.clearInterval(progressPollRef.current);
      progressPollRef.current = null;
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
  const showSkeleton = isBusy && !response;
  const progressStepIndex = Math.max(
    0,
    ANALYZE_PROGRESS_STEPS.findIndex((step) => step.id === progressStage),
  );
  const progressPercent =
    progressStatus === "done"
      ? 100
      : ((progressStepIndex + 1) / ANALYZE_PROGRESS_STEPS.length) * 100;

  return (
    <main>
      <section className="hero">
        <p className="hero-kicker">Content Intelligence Studio</p>
        <h1>Gaseo Checker</h1>
        <p>
          블로그 URL 하나로 GEO · AEO · SEO · CWV를 빠르게 진단하고, 우선순위가 높은 개선 포인트를
          짚어 바로 개선할 수 있도록 설계된 분석 플랫폼입니다.
        </p>
      </section>

      <div className="platform-sticky">
        <label>분석 플랫폼</label>
        <div className="row platform-row">
          {SUPPORTED_PLATFORMS.map((item) => (
            <button
              key={item}
              type="button"
              className={`tab platform-tab ${item} ${platform === item ? "active" : ""}`}
              disabled={isBusy}
              onClick={() => setPlatform(item)}
            >
              {PLATFORM_LABELS[item]}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">분석 요청</h2>
        <form className="grid" onSubmit={onSubmit}>
          <div>
            <label htmlFor="url">URL</label>
            <input
              id="url"
              type="text"
              placeholder={PLATFORM_PLACEHOLDERS[platform]}
              value={url}
              disabled={isBusy}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <button type="submit" disabled={isBusy}>
            {isBusy ? "분석 진행 중..." : "정밀 분석 시작"}
          </button>
          <div className={`progress-onboarding ${isBusy ? "show" : ""}`} aria-hidden={!isBusy}>
            <div className="progress-head">
              <strong>분석 파이프라인</strong>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="progress-steps">
              {ANALYZE_PROGRESS_STEPS.map((step, index) => (
                <span
                  key={step.id}
                  className={`progress-step ${index < progressStepIndex ? "done" : ""} ${
                    index === progressStepIndex ? "active" : ""
                  }`}
                >
                  {index + 1}. {step.label}
                </span>
              ))}
            </div>
          </div>
        </form>
      </div>

      <div className="card result-shell">
        <div className="status-bar">
          <p className="status-text">
            현재 상태: <span className="code">{state}</span> ({stateHint})
          </p>
          <span className={`badge ${statusClass}`}>{responseStatus ?? "waiting"}</span>
        </div>
        {errorCode && (
          <p>
            오류 코드: <span className="code">{errorCode}</span> /{" "}
            {ERROR_MESSAGES[errorCode]}
          </p>
        )}
        {showSkeleton && (
          <section className="skeleton-wrap" aria-live="polite" aria-busy="true">
            <div className="skeleton-row">
              <span className="skeleton-chip" />
              <span className="skeleton-chip" />
              <span className="skeleton-chip" />
              <span className="skeleton-chip" />
            </div>
            <div className="skeleton-grid">
              <div className="skeleton-panel">
                <div className="skeleton-line w-60" />
                <div className="skeleton-line w-90" />
                <div className="skeleton-line w-75" />
                <div className="skeleton-line w-85" />
              </div>
              <div className="skeleton-panel">
                <div className="skeleton-line w-55" />
                <div className="skeleton-line w-70" />
                <div className="skeleton-line w-80" />
              </div>
            </div>
          </section>
        )}
        {response && (
          <>
            {inpNote === "lab" && <p>INP는 참고용(Lab) 지표입니다.</p>}
            {response.data && (
              <>
                <div className="split">
                  <section>
                    <div className="row">
                      <button type="button" className={`tab ${activeTab === "seo" ? "active" : ""}`} onClick={() => setActiveTab("seo")}>SEO</button>
                      <button type="button" className={`tab ${activeTab === "aeo" ? "active" : ""}`} onClick={() => setActiveTab("aeo")}>AEO</button>
                      <button type="button" className={`tab ${activeTab === "geo" ? "active" : ""}`} onClick={() => setActiveTab("geo")}>GEO</button>
                      <button type="button" className={`tab ${activeTab === "dia" ? "active" : ""}`} onClick={() => setActiveTab("dia")}>DIA / EEAT</button>
                      <button type="button" className={`tab ${activeTab === "cwv" ? "active" : ""}`} onClick={() => setActiveTab("cwv")}>CWV</button>
                    </div>

                    <div key={activeTab} className="tab-panel tab-fade">
                      {(aeoConfidence < 0.7 || geoConfidence < 0.7) && (
                        <p className="soft-note">
                          신뢰도 하한 경고: AEO/GEO 신뢰도가 낮아 점수보다 체크리스트 근거를 우선 확인해 주세요.
                        </p>
                      )}
                      {(aeoConfidence < 0.6 || geoConfidence < 0.6) && (
                        <p className="soft-note">
                          예측 해석 주의: 신뢰도 0.60 미만 영역이 포함되어 결과 해석 시 주의가 필요합니다.
                        </p>
                      )}

                      {activeTab === "seo" && (
                        <>
                          <AnimatedMetric label="SEO 점수" value={response.data.seo.score} />
                          <AnimatedMetric
                            label="신뢰도"
                            value={response.data.seo.confidence}
                            digits={2}
                          />
                          {response.data.seo.items.map((item) => (
                            <label key={item.id} className="rule-item">
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
                                  className="ghost-btn"
                                >
                                  하이라이트 보기
                                </button>
                              )}
                            </label>
                          ))}
                        </>
                      )}
                      {activeTab === "aeo" && (
                        <>
                          <AnimatedMetric label="AEO 점수" value={response.data.aeo.score} />
                          <AnimatedMetric
                            label="신뢰도"
                            value={response.data.aeo.confidence}
                            digits={2}
                          />
                        </>
                      )}
                      {activeTab === "geo" && (
                        <>
                          <AnimatedMetric label="GEO 점수" value={response.data.geo.score} />
                          <AnimatedMetric
                            label="신뢰도"
                            value={response.data.geo.confidence}
                            digits={2}
                          />
                        </>
                      )}
                      {activeTab === "dia" && (
                        <>
                          <AnimatedMetric label="DIA" value={response.data.searchQuality.diaScore} />
                          <AnimatedMetric label="EEAT" value={response.data.searchQuality.eeatScore} />
                        </>
                      )}
                      {activeTab === "cwv" && (
                        <>
                          <AnimatedMetric
                            label="LCP"
                            value={response.data.webVitals.lab.lcp?.value ?? 0}
                            suffix="s"
                            digits={2}
                          />
                          <AnimatedMetric
                            label="INP"
                            value={response.data.webVitals.lab.inp?.value ?? 0}
                            suffix="ms"
                            digits={0}
                          />
                          <AnimatedMetric
                            label="CLS"
                            value={response.data.webVitals.lab.cls?.value ?? 0}
                            digits={3}
                          />
                        </>
                      )}
                    </div>
                  </section>

                  <aside>
                    <h3 className="section-title aside-title">
                      실행 가이드
                    </h3>
                    <ul className="meta-list">
                      <li className="meta-item"><span>플랫폼</span><strong>{response.data.platform}</strong></li>
                      <li className="meta-item"><span>파서 버전</span><strong>{response.data.parsed.parserMeta.parserVersion}</strong></li>
                      <li className="meta-item"><span>선택자</span><strong>{response.data.parsed.parserMeta.contentSelectorUsed}</strong></li>
                      <li className="meta-item"><span>본문 길이</span><strong>{response.data.parsed.bodyText.length}</strong></li>
                    </ul>
                    <p className="soft-note">우선순위 높은 체크 항목을 선택한 뒤 시뮬레이션을 실행해 보세요.</p>
                    <button type="button" onClick={onSimulate}>선택 항목 점수 시뮬레이션</button>
                  </aside>
                </div>

                {simulation && (
                  <p className="meta-line">
                    예상 총점 변화: {simulation.before.total} → {simulation.after.total} ({simulation.delta.total >= 0 ? "+" : ""}
                    {simulation.delta.total})
                  </p>
                )}
                {regression && (
                  <p className="meta-line">
                    회귀 감지: {regression.trend} / 총점 변화 {regression.delta.total >= 0 ? "+" : ""}
                    {regression.delta.total}
                  </p>
                )}
                <div className="meta-line">
                  <button type="button" onClick={onCreateShareLink}>공유 링크 생성</button>
                </div>
                {shareUrl && (
                  <p className="meta-line break-all">
                    공유 링크: {shareUrl}
                  </p>
                )}
                {shareMode === "warning" && (
                  <p className="meta-line">
                    공유 링크 길이 경고 구간입니다(1801~3500). 일부 환경에서 열리지 않을 수 있습니다.
                  </p>
                )}
                {shareMode === "minimal" && (
                  <p className="meta-line">
                    길이 초과로 요약 공유 모드로 자동 축약되었습니다.
                  </p>
                )}
                {historyItems.length > 0 && (
                  <p className="meta-line">
                    로컬 히스토리: {historyItems.length}건 (최대 10건/30일)
                  </p>
                )}
                <div className="preview-box">
                  <strong>본문 미리보기</strong>
                  <p className="preview-content">
                    {beforePreview}
                    {activeHighlight && <mark>{markPreview}</mark>}
                    {afterPreview}
                  </p>
                </div>
              </>
            )}
            <details className="debug-details">
              <summary className="muted">디버그 원본 응답 보기</summary>
              <pre className="debug-pre">{JSON.stringify(response, null, 2)}</pre>
            </details>
          </>
        )}
      </div>
      <p className="legal-note">
        본 분석 결과는 참고용이며 검색 순위/성과를 보장하지 않습니다. 민감 주제(건강/금융/법률)는 전문가 검토를 권장합니다.
      </p>
    </main>
  );
}
