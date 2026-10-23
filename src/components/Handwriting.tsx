import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  PenLine,
  Pencil,
  Highlighter,
  Eraser,
  Hand,
  Undo2,
  Redo2,
  Trash2,
  X,
  Send,
  Minus,
  Plus,
  Expand,
  Mic,
  Sparkles,
  Check,
  FileDown,
} from "lucide-react";
import { InkEngine, type InkTool } from "../ink/InkEngine";
import { loadDraft, saveDraft } from "../services/drafts";
import { api, json } from "../services/api";
import {
  emptyInk,
  type InkDocument,
  type ClassroomData,
} from "../../shared/protocol";
import { IconButton, ErrorNotice, errorText, Spinner, download } from "./ui";
import { VoiceReview } from "./VoiceReview";
import { useClassroomUI } from "../state/classroom";
export interface InputAttachment {
  text: string;
  image?: string;
  consent: boolean;
}
export function Handwriting({
  userId,
  classroom,
  onClose,
  onSubmit,
}: {
  userId: string;
  classroom: ClassroomData;
  onClose: () => void;
  onSubmit: (v: InputAttachment) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<InkEngine | null>(null),
    revision = useRef(classroom.handwriting?.revision ?? -1),
    latest = useRef<InkDocument>(emptyInk()),
    saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    recognizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    request = useRef<AbortController | null>(null),
    mounted = useRef(true),
    saving = useRef<Promise<void>>(Promise.resolve());
  const [ready, setReady] = useState(false),
    [tool, setTool] = useState<InkTool>("pen"),
    [color, setColor] = useState("#263342"),
    [width, setWidth] = useState(3),
    [status, setStatus] = useState("正在恢复草稿…"),
    [error, setError] = useState(""),
    [candidate, setCandidate] = useState(""),
    [recognized, setRecognized] = useState(false),
    [recognizing, setRecognizing] = useState(false),
    [consent, setConsent] = useState(false),
    [auto, setAuto] = useState(true),
    [mode, setMode] = useState<"text" | "ink" | "both">(
      ["math", "physics", "chemistry"].includes(classroom.subjectId)
        ? "both"
        : "text",
    ),
    [kind, setKind] = useState("auto"),
    [voice, setVoice] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [count, setCount] = useState(0),
    [recognitionRev, setRecognitionRev] = useState(-1),
    [metrics, setMetrics] = useState<{
      frames: number;
      points: number;
      meanMs: number;
      maxMs: number;
    } | null>(null);
  const settings = useRef({ consent, auto, kind });
  settings.current = { consent, auto, kind };
  const key = userId + ":" + classroom.id;
  const setClassStatus = useClassroomUI((s) => s.setStatus);
  const local = (doc: InkDocument) =>
    saveDraft({
      key,
      document: doc,
      serverRevision: revision.current,
      savedAt: Date.now(),
    });
  const remoteSave = () => {
    const document = structuredClone(latest.current);
    saving.current = saving.current
      .catch(() => {})
      .then(async () => {
        try {
          const r = await api<{ revision: number }>(
            `/classrooms/${classroom.id}/ink`,
            {
              method: "PUT",
              body: json({ document, expectedVersion: revision.current }),
            },
          );
          revision.current = r.revision;
          await local(latest.current);
          if (mounted.current) setStatus("草稿已安全保存");
        } catch (e) {
          if (mounted.current) setStatus("已保存在此设备 · 云端同步待重试");
          if (mounted.current && errorText(e).includes("另一窗口"))
            setError(errorText(e));
        }
      });
    return saving.current;
  };
  const queueSave = (doc: InkDocument) => {
    latest.current = doc;
    void local(doc).catch(
      () => mounted.current && setError("本地草稿写入失败，请导出笔迹备份"),
    );
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void remoteSave(), 1100);
  };
  const recognize = async () => {
    const ink = engine.current;
    if (!ink || !ink.document.strokes.length) return;
    if (!settings.current.consent) {
      setError("云端识别会发送本次笔迹图片，请先勾选授权。");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const document = ink.snapshot(),
      rev = document.revision;
    setRecognizing(true);
    setError("");
    setClassStatus("HANDWRITING_RECOGNIZING");
    try {
      const r = await api<{
        text: string;
        revision: number;
        uncertain: boolean;
        kind: string;
      }>(`/classrooms/${classroom.id}/recognize`, {
        method: "POST",
        body: json({
          image: ink.exportPNG(),
          revision: rev,
          kind: settings.current.kind,
          consent: true,
        }),
        signal: controller.signal,
      });
      if (controller.signal.aborted || ink.snapshot().revision !== rev) return;
      setCandidate(r.text);
      setRecognized(true);
      setRecognitionRev(rev);
      setStatus(
        r.uncertain
          ? "识别存在不确定内容，请检查候选"
          : "候选已生成，请检查与编辑",
      );
    } catch (e) {
      if (!controller.signal.aborted) setError(errorText(e));
    } finally {
      if (mounted.current && request.current === controller) {
        setRecognizing(false);
        setClassStatus("HANDWRITING");
      }
    }
  };
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    setClassStatus("HANDWRITING");
    async function init() {
      try {
        const localDoc = await loadDraft(key);
        if (cancelled) return;
        const initial =
          localDoc?.document ??
          (classroom.handwriting
            ? JSON.parse(classroom.handwriting.data)
            : emptyInk());
        if (localDoc && localDoc.serverRevision !== revision.current)
          setStatus("已恢复本地草稿，请保存；若多窗口冲突可导出备份");
        else
          setStatus(
            initial.strokes.length
              ? "已恢复上次的笔迹"
              : "落笔即写，思考不受限",
          );
        latest.current = initial;
        const ink = new InkEngine(canvas.current!, initial);
        engine.current = ink;
        setCount(initial.strokes.length);
        ink.onProgress = (doc) => queueSave(doc);
        ink.onChange = (doc) => {
          queueSave(doc);
          setCount(doc.strokes.length);
          request.current?.abort();
          setRecognizing(false);
          setStatus("草稿自动保存中…");
          if (recognizeTimer.current) clearTimeout(recognizeTimer.current);
          if (
            settings.current.auto &&
            settings.current.consent &&
            doc.strokes.length
          )
            recognizeTimer.current = setTimeout(() => void recognize(), 1800);
        };
        setReady(true);
      } catch (e) {
        setError(errorText(e));
      }
    }
    void init();
    return () => {
      cancelled = true;
      mounted.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (recognizeTimer.current) clearTimeout(recognizeTimer.current);
      request.current?.abort();
      engine.current?.dispose();
      void local(latest.current);
      void remoteSave();
      if (window.desktop) void window.desktop.fullscreen(false);
      else if (document.fullscreenElement) void document.exitFullscreen();
    };
  }, []);
  useEffect(() => {
    if (engine.current) {
      engine.current.tool = tool;
      engine.current.color = color;
      engine.current.width = width;
    }
  }, [tool, color, width, ready]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (voice) return;
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        submit();
        return;
      }
      if ((e.target as HTMLElement).matches("input,textarea,select")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        engine.current?.undo();
      }
      if (e.ctrlKey && ["y", "Z"].includes(e.key)) {
        e.preventDefault();
        engine.current?.redo();
      }
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  const submit = () => {
    const ink = engine.current;
    if (!ink) return;
    ink.finish();
    if (mode === "text" && !candidate.trim()) {
      setError("先识别或填写文字候选，也可以切换为原始笔迹提交。");
      return;
    }
    if (mode !== "text" && !consent) {
      setError("原始笔迹将发送给云端 AI，请先勾选授权。");
      return;
    }
    if (mode !== "text" && !ink.document.strokes.length) {
      setError("请先写下问题");
      return;
    }
    const value = {
      text: candidate,
      image: mode === "text" ? undefined : ink.exportPNG(),
      consent,
    };
    void local(ink.snapshot());
    void remoteSave();
    onSubmit(value);
  };
  return (
    <motion.div
      className="handwriting-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="全屏手写"
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.2 }}
    >
      <canvas
        ref={canvas}
        className={"ink-canvas tool-" + tool}
        aria-label="全屏书写画布"
      />
      <header className="ink-header">
        <div>
          <span className="ink-badge">
            <PenLine size={18} />
          </span>
          <b>随手写，自由问。</b>
          <span className="muted">{status}</span>
        </div>
        <div>
          <IconButton
            label="应用全屏"
            onClick={async () => {
              try {
                if (window.desktop)
                  await window.desktop.fullscreen(!fullscreen);
                else if (!fullscreen)
                  await document.documentElement.requestFullscreen();
                else await document.exitFullscreen();
                setFullscreen((v) => !v);
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            <Expand size={18} />
          </IconButton>
          <button className="secondary" onClick={onClose}>
            <X size={16} />
            保存并返回 <kbd>Esc</kbd>
          </button>
        </div>
      </header>
      {!count && ready && (
        <div className="ink-empty" aria-hidden="true">
          <span>在这里，写下你的思考。</span>
          <p>
            公式、文字、图形，都可以。
            <br />
            支持数位笔压感，也可以使用鼠标。
          </p>
        </div>
      )}
      <div className="ink-toolbar">
        {(
          [
            { id: "pen", label: "圆珠笔", Icon: PenLine },
            { id: "pencil", label: "铅笔", Icon: Pencil },
            { id: "highlighter", label: "荧光笔", Icon: Highlighter },
            { id: "eraser", label: "橡皮擦", Icon: Eraser },
            { id: "pan", label: "平移画布", Icon: Hand },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            className={tool === id ? "active" : ""}
            title={label}
            aria-label={label}
            onClick={() => setTool(id)}
          >
            <Icon size={20} />
          </button>
        ))}
        <i className="divider" />
        {["#263342", "#7381f7", "#d38e89", "#65ac92"].map((c) => (
          <button
            className={"ink-color " + (color === c ? "selected" : "")}
            title={c}
            key={c}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={"笔迹颜色 " + c}
          />
        ))}
        <input
          aria-label="笔宽"
          type="range"
          min="1"
          max="10"
          step=".5"
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
        />
        <i className="divider" />
        <IconButton label="撤销笔迹" onClick={() => engine.current?.undo()}>
          <Undo2 size={18} />
        </IconButton>
        <IconButton label="重做笔迹" onClick={() => engine.current?.redo()}>
          <Redo2 size={18} />
        </IconButton>
        <IconButton
          label="清空笔迹（可以撤销）"
          onClick={() => engine.current?.clear()}
        >
          <Trash2 size={18} />
        </IconButton>
        <IconButton
          label="导出笔迹备份"
          onClick={() =>
            download(
              "classroom-handwriting.json",
              json(engine.current?.snapshot()),
            )
          }
        >
          <FileDown size={18} />
        </IconButton>
      </div>
      <div className="ink-view-tools">
        <IconButton label="缩小画布" onClick={() => engine.current?.zoom(0.8)}>
          <Minus size={17} />
        </IconButton>
        <button
          className="text-button"
          onClick={() => engine.current?.resetView()}
        >
          复位
        </button>
        <IconButton label="放大画布" onClick={() => engine.current?.zoom(1.25)}>
          <Plus size={17} />
        </IconButton>
        <span>{count} 笔 · 滚轮缩放 · 手掌平移</span>
        <button
          className="text-button"
          onClick={() => {
            const s = engine.current?.stats;
            if (s)
              setMetrics({
                frames: s.frames,
                points: s.points,
                meanMs: s.frames ? s.renderMs / s.frames : 0,
                maxMs: s.maxRenderMs,
              });
          }}
        >
          性能诊断
        </button>
      </div>
      {metrics && (
        <div className="ink-metrics" data-metrics={JSON.stringify(metrics)}>
          <b>Canvas 绘制实测</b>
          <span>
            {metrics.frames} 帧 / {metrics.points} 个采样点
          </span>
          <span>
            平均 {metrics.meanMs.toFixed(2)} ms · 最大{" "}
            {metrics.maxMs.toFixed(2)} ms
          </span>
          <small>CPU绘制耗时，不等于端到端笔延迟。</small>
          <button className="text-button" onClick={() => setMetrics(null)}>
            关闭
          </button>
        </div>
      )}
      <aside className="ink-review">
        <div className="ink-review-heading">
          <span>
            <Sparkles size={15} />
            识别与提交
          </span>
          <select
            aria-label="识别类型"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="auto">智能区分</option>
            <option value="text">普通文字</option>
            <option value="math">数学公式</option>
            <option value="diagram">图形 / 示意图</option>
          </select>
        </div>
        <textarea
          aria-label="手写识别候选"
          value={candidate}
          onChange={(e) => {
            setCandidate(e.target.value);
            setRecognized(false);
          }}
          placeholder="识别候选出现在这里，也可以手动填写或语音补充。原始笔迹始终保留。"
        />
        {recognized && recognitionRev !== engine.current?.document.revision && (
          <small className="warning-text">
            笔迹已更新，候选对应之前的版本，请重新识别或手动核对。
          </small>
        )}
        <div className="ink-recognition-options">
          <label className="check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            同意将本次笔迹图片发送至配置的云端模型
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            停笔后生成候选，不自动提交
          </label>
        </div>
        <ErrorNotice message={error} />
        <div className="ink-review-actions">
          <button
            className="secondary"
            disabled={recognizing || !count}
            onClick={() => void recognize()}
          >
            {recognizing ? <Spinner /> : <Sparkles size={15} />}转换文字
          </button>
          <button className="secondary" onClick={() => setVoice(true)}>
            <Mic size={15} />
            语音补充
          </button>
          <select
            aria-label="手写提交方式"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="text">仅确认文字</option>
            <option value="ink">原始笔迹</option>
            <option value="both">文字 + 笔迹</option>
          </select>
          <button className="primary" onClick={submit}>
            <Send size={16} />
            发送提问
          </button>
        </div>
        <small className="muted">
          <Check size={12} />{" "}
          草稿不会因退出、识别或发送而自动清空。公式和图示建议保留原始笔迹。
        </small>
      </aside>
      {voice && (
        <VoiceReview
          onClose={() => {
            setVoice(false);
            setClassStatus("HANDWRITING");
          }}
          onInsert={(text) => {
            setCandidate((s) => s + (s ? "\n" : "") + text);
            setVoice(false);
            setClassStatus("HANDWRITING");
          }}
        />
      )}
    </motion.div>
  );
}
