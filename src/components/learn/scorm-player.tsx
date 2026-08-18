"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Maximize2, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/interactive";
import { buttonClass } from "@/components/ui/button";

/**
 * SCORM API adapter (browser side).
 *
 * Implements the SCORM 1.2 `API` and SCORM 2004 `API_1484_11` objects on the
 * window that hosts the content iframe, which is exactly what packaged content
 * looks for when it walks up `window.parent`. Values are held in memory for the
 * synchronous get/set contract and flushed to the LMS (`/api/scorm/runtime`) on
 * commit, on a 30-second timer, and on page hide — so a learner can close the
 * tab mid-module and resume exactly where they stopped.
 */

export interface ScormInitialState {
  cmi: Record<string, string | number>;
  entry: "ab-initio" | "resume";
  lessonStatus: string;
  suspendData: string;
  lessonLocation: string;
  totalTimeSeconds: number;
  scoreRaw: number | null;
}

interface Props {
  enrollmentId: string;
  moduleId: string;
  packageId: string;
  launchFile: string;
  scormVersion: string;
  studentName: string;
  studentId: string;
  masteryScore: number | null;
  initialState: ScormInitialState;
  onCompleted?: () => void;
}

function secondsToHms(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}`;
}

export function ScormPlayer(props: Props) {
  const router = useRouter();
  const toast = useToast();
  const [ready, setReady] = React.useState(false);
  const [status, setStatus] = React.useState(props.initialState.lessonStatus || "not attempted");
  const [score, setScore] = React.useState<number | null>(props.initialState.scoreRaw);
  const [committing, setCommitting] = React.useState(false);
  const frameRef = React.useRef<HTMLIFrameElement>(null);

  const dataRef = React.useRef<Record<string, string>>({});
  const dirtyRef = React.useRef<Record<string, string>>({});
  const errorRef = React.useRef("0");
  const startedRef = React.useRef(Date.now());
  const finishedRef = React.useRef(false);

  const flush = React.useCallback(
    async (finish = false) => {
      const payload = { ...dirtyRef.current };
      if (!Object.keys(payload).length && !finish) return;
      dirtyRef.current = {};
      setCommitting(true);
      try {
        const res = await fetch("/api/scorm/runtime", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enrollmentId: props.enrollmentId,
            moduleId: props.moduleId,
            cmi: payload,
            finish,
          }),
          keepalive: true,
        });
        if (res.ok) {
          const result = await res.json();
          if (result.score !== null && result.score !== undefined) setScore(result.score);
          if (result.lessonStatus) setStatus(result.lessonStatus);
          if (result.moduleCompleted) {
            props.onCompleted?.();
            toast(result.courseCompleted ? "Course complete — recorded on your transcript" : "Module complete");
            router.refresh();
          }
        }
      } catch {
        // Keep the values queued so the next commit retries them.
        dirtyRef.current = { ...payload, ...dirtyRef.current };
      } finally {
        setCommitting(false);
      }
    },
    [props, router, toast],
  );

  // Install the SCORM API objects before the content iframe is rendered.
  React.useEffect(() => {
    const initial: Record<string, string> = {
      "cmi.core.student_id": props.studentId,
      "cmi.core.student_name": props.studentName,
      "cmi.core.lesson_status": props.initialState.lessonStatus || "not attempted",
      "cmi.core.lesson_location": props.initialState.lessonLocation ?? "",
      "cmi.core.entry": props.initialState.entry,
      "cmi.core.credit": "credit",
      "cmi.core.lesson_mode": "normal",
      "cmi.core.total_time": secondsToHms(props.initialState.totalTimeSeconds ?? 0),
      "cmi.core.score.raw": props.initialState.scoreRaw !== null ? String(props.initialState.scoreRaw) : "",
      "cmi.core.score.min": "0",
      "cmi.core.score.max": "100",
      "cmi.suspend_data": props.initialState.suspendData ?? "",
      "cmi.launch_data": "",
      "cmi.student_data.mastery_score": props.masteryScore !== null ? String(props.masteryScore) : "",
      // SCORM 2004 equivalents
      "cmi.learner_id": props.studentId,
      "cmi.learner_name": props.studentName,
      "cmi.completion_status": props.initialState.lessonStatus === "completed" || props.initialState.lessonStatus === "passed" ? "completed" : "incomplete",
      "cmi.success_status": props.initialState.lessonStatus === "passed" ? "passed" : "unknown",
      "cmi.location": props.initialState.lessonLocation ?? "",
      "cmi.entry": props.initialState.entry,
      "cmi.mode": "normal",
      "cmi.credit": "credit",
      "cmi.total_time": secondsToHms(props.initialState.totalTimeSeconds ?? 0),
      "cmi.score.min": "0",
      "cmi.score.max": "100",
      ...Object.fromEntries(Object.entries(props.initialState.cmi ?? {}).map(([k, v]) => [k, String(v)])),
    };
    dataRef.current = initial;

    const setValue = (key: string, value: string) => {
      dataRef.current[key] = String(value);
      dirtyRef.current[key] = String(value);
      if (key === "cmi.core.lesson_status" || key === "cmi.completion_status" || key === "cmi.success_status") {
        setStatus(String(value));
      }
      if (key === "cmi.core.score.raw" || key === "cmi.score.raw") setScore(Number(value));
      errorRef.current = "0";
      return "true";
    };

    const getValue = (key: string) => {
      errorRef.current = "0";
      const value = dataRef.current[key];
      if (value === undefined) {
        // Unknown elements are reported as "not implemented" rather than throwing.
        errorRef.current = key.startsWith("cmi.") ? "401" : "201";
        return "";
      }
      return value;
    };

    const scorm12 = {
      LMSInitialize: () => { startedRef.current = Date.now(); errorRef.current = "0"; return "true"; },
      LMSFinish: () => {
        if (!finishedRef.current) {
          finishedRef.current = true;
          const elapsed = Math.round((Date.now() - startedRef.current) / 1000);
          if (!dirtyRef.current["cmi.core.session_time"]) dirtyRef.current["cmi.core.session_time"] = secondsToHms(elapsed);
          void flush(true);
        }
        return "true";
      },
      LMSGetValue: (key: string) => getValue(key),
      LMSSetValue: (key: string, value: string) => setValue(key, value),
      LMSCommit: () => { void flush(false); return "true"; },
      LMSGetLastError: () => errorRef.current,
      LMSGetErrorString: (code: string) => (code === "0" ? "No error" : "General error"),
      LMSGetDiagnostic: (code: string) => code,
    };

    const scorm2004 = {
      Initialize: scorm12.LMSInitialize,
      Terminate: scorm12.LMSFinish,
      GetValue: scorm12.LMSGetValue,
      SetValue: scorm12.LMSSetValue,
      Commit: scorm12.LMSCommit,
      GetLastError: scorm12.LMSGetLastError,
      GetErrorString: scorm12.LMSGetErrorString,
      GetDiagnostic: scorm12.LMSGetDiagnostic,
    };

    (window as unknown as Record<string, unknown>).API = scorm12;
    (window as unknown as Record<string, unknown>).API_1484_11 = scorm2004;
    setReady(true);

    const timer = window.setInterval(() => void flush(false), 30000);
    const onHide = () => { if (Object.keys(dirtyRef.current).length) void flush(false); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      delete (window as unknown as Record<string, unknown>).API;
      delete (window as unknown as Record<string, unknown>).API_1484_11;
    };
  }, [props, flush]);

  const src = `/api/scorm/${props.packageId}/content/${props.launchFile.split("/").map(encodeURIComponent).join("/")}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--muted)]">
        <span className="flex items-center gap-2">
          <span className="rounded-md bg-[var(--surface-3)] px-2 py-0.5 font-medium">SCORM {props.scormVersion}</span>
          <span>Status: <strong className="text-[var(--foreground)]">{status || "not attempted"}</strong></span>
          {score !== null ? <span>Score: <strong className="text-[var(--foreground)]">{score}%</strong></span> : null}
          {committing ? <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> saving…</span> : null}
        </span>
        <span className="flex items-center gap-1.5">
          <button onClick={() => void flush(false)} className={buttonClass("ghost", "sm")} title="Save progress now">
            <RefreshCw size={13} /> Save progress
          </button>
          <button
            onClick={() => frameRef.current?.requestFullscreen?.()}
            className={buttonClass("ghost", "sm")} title="Full screen"
          >
            <Maximize2 size={13} /> Full screen
          </button>
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-black/5">
        {ready ? (
          <iframe
            ref={frameRef}
            src={src}
            title="SCORM course content"
            // Same-origin is required for the content to reach the SCORM API on
            // this window; scripts and forms are allowed, everything else is not.
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            className="h-[68vh] min-h-[520px] w-full bg-white"
          />
        ) : (
          <div className="flex h-[68vh] min-h-[520px] items-center justify-center">
            <Loader2 className="animate-spin text-[var(--muted)]" />
          </div>
        )}
      </div>
    </div>
  );
}
