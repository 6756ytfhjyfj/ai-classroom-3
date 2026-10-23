import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  ChevronDown,
  Undo2,
  Redo2,
  PanelRightClose,
  PanelRightOpen,
  NotebookPen,
  WifiOff,
  Check,
  RotateCcw,
} from "lucide-react";
import { api, json, readSSE } from "../services/api";
import { teacherVoice } from "../services/speech";
import { useClassroomUI } from "../state/classroom";
import {
  subjects,
  labPresets,
  type ClassroomData,
  type LabState,
  type ChatMessage,
  type PublicUser,
  type TeachingPlanData,
} from "../../shared/protocol";
import { GraphLab } from "../labs/GraphLab";
import { CircuitLab } from "../labs/CircuitLab";
import { AtomLab, CellLab, ReadingLab } from "../labs/ScienceLabs";
import {
  GeometryLab,
  MotionLab,
  ForceLab,
  OpticsLab,
  MoleculeLab,
  DnaLab,
} from "../labs/InteractiveLabs";
import { Handwriting, type InputAttachment } from "./Handwriting";
import { VoiceReview } from "./VoiceReview";
import { ChatPanel } from "./ChatPanel";
import { IconButton, ErrorNotice, errorText, Spinner } from "./ui";
export function Classroom({
  id,
  user,
  onUpdated,
}: {
  id: string;
  user: PublicUser;
  onUpdated: () => void;
}) {
  const [data, setData] = useState<ClassroomData | null>(null),
    [lab, setLab] = useState<LabState | null>(null),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [draft, setDraft] = useState(
      () => localStorage.getItem(`question:${user.id}:${id}`) ?? "",
    ),
    [attachment, setAttachment] = useState<string | undefined>(),
    [busy, setBusy] = useState(false),
    [ink, setInk] = useState(false),
    [voice, setVoice] = useState(false),
    [error, setError] = useState(""),
    [syncError, setSyncError] = useState(""),
    [saved, setSaved] = useState(true),
    [rightOpen, setRightOpen] = useState(true),
    [toolOutput, setToolOutput] = useState(""),
    [plan, setPlan] = useState<TeachingPlanData | null>(null);
  const version = useRef(0),
    pending = useRef<LabState | null>(null),
    saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    writes = useRef<Promise<void>>(Promise.resolve()),
    request = useRef<AbortController | null>(null),
    runId = useRef(0),
    mounted = useRef(true),
    undo = useRef<LabState[]>([]),
    redo = useRef<LabState[]>([]);
  const setStatus = useClassroomUI((s) => s.setStatus);
  const load = async () => {
    const c = await api<ClassroomData>(`/classrooms/${id}`);
    if (!mounted.current) return;
    version.current = c.visualization.revision;
    setData(c);
    setLab(JSON.parse(c.visualization.data));
    setMessages(c.conversation.messages);
    setPlan(
      c.plans?.length ? JSON.parse(c.plans[c.plans.length - 1].data) : null,
    );
  };
  const interrupt = () => {
    runId.current++;
    request.current?.abort();
    request.current = null;
    teacherVoice.stop();
    setBusy(false);
    setStatus("AI_INTERRUPTED");
    void api(`/classrooms/${id}/cancel`, { method: "POST", body: "{}" }).catch(
      () => {},
    );
  };
  const flush = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    writes.current = writes.current
      .catch(() => {})
      .then(async () => {
        const state = pending.current;
        if (!state) return;
        pending.current = null;
        try {
          const r = await api<{ revision: number }>(`/classrooms/${id}/state`, {
            method: "PUT",
            body: json({ state, expectedVersion: version.current }),
          });
          version.current = r.revision;
          if (mounted.current) {
            setSyncError("");
            setSaved(!pending.current);
          }
        } catch (e) {
          pending.current = state;
          if (mounted.current) {
            setSyncError(errorText(e));
            setSaved(false);
          }
          throw e;
        }
      });
    return writes.current;
  };
  useEffect(() => {
    mounted.current = true;
    setStatus("IDLE");
    void load().catch((e) => setError(errorText(e)));
    const unload = (e: BeforeUnloadEvent) => {
      if (
        pending.current ||
        localStorage.getItem(`question:${user.id}:${id}`)
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      mounted.current = false;
      runId.current++;
      request.current?.abort();
      teacherVoice.stop();
      void api(`/classrooms/${id}/cancel`, {
        method: "POST",
        body: "{}",
      }).catch(() => {});
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void flush().catch(() => {});
      window.removeEventListener("beforeunload", unload);
    };
  }, [id]);
  useEffect(() => {
    localStorage.setItem(`question:${user.id}:${id}`, draft);
  }, [draft, id, user.id]);
  useEffect(() => {
    teacherVoice.onState = (s) => {
      if (s === "speaking") setStatus("AI_SPEAKING");
      else if (
        s === "idle" &&
        useClassroomUI.getState().status === "AI_SPEAKING"
      )
        setStatus("TEACHING");
    };
    return () => {
      teacherVoice.onState = () => {};
    };
  }, []);
  const changeLab = (state: LabState, history = true) => {
    if (request.current || speechSynthesis.speaking) interrupt();
    if (history && lab) {
      undo.current.push(lab);
      if (undo.current.length > 80) undo.current.shift();
      redo.current = [];
    }
    setLab(state);
    pending.current = state;
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush().catch(() => {}), 500);
  };
  const undoLab = () => {
    const state = undo.current.pop();
    if (state && lab) {
      redo.current.push(lab);
      changeLab(state, false);
    }
  };
  const redoLab = () => {
    const state = redo.current.pop();
    if (state && lab) {
      undo.current.push(lab);
      changeLab(state, false);
    }
  };
  const openInk = () => {
    interrupt();
    setInk(true);
    setStatus("HANDWRITING");
  };
  const openVoice = () => {
    interrupt();
    setVoice(true);
    setStatus("INPUT_REVIEW");
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (ink || voice) return;
      const prefs = JSON.parse(user.preferences || "{}"),
        shortcuts = prefs.shortcuts ?? {};
      const combo = [
        e.ctrlKey ? "Ctrl" : "",
        e.shiftKey ? "Shift" : "",
        e.altKey ? "Alt" : "",
        e.key.length === 1 ? e.key.toUpperCase() : e.key,
      ]
        .filter(Boolean)
        .join("+");
      if (combo === (shortcuts.handwriting ?? "Ctrl+Shift+H")) {
        e.preventDefault();
        openInk();
      }
      if (combo === (shortcuts.voice ?? "Ctrl+Shift+M")) {
        e.preventDefault();
        openVoice();
      }
      if (
        (e.target as HTMLElement).matches(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      if (e.code === "Space" && !ink && !voice) {
        e.preventDefault();
        if (speechSynthesis.paused) teacherVoice.resume();
        else if (speechSynthesis.speaking) teacherVoice.pause();
      }
      if (e.key === "Escape" && !ink && !voice) interrupt();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  async function send(value?: InputAttachment) {
    if (busy || !data) return;
    const text = value?.text ?? draft,
      image = value ? value.image : attachment,
      consent = value?.consent ?? !!attachment;
    if (!text.trim() && !image) return;
    setError("");
    try {
      await flush();
    } catch {
      return;
    }
    teacherVoice.stop();
    const gen = ++runId.current,
      controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setStatus("AI_THINKING");
    const uid = crypto.randomUUID(),
      aid = crypto.randomUUID();
    let answer = "",
      accepted = false;
    try {
      const response = await fetch(`/api/classrooms/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json({ requestId: uid, text, image, consent }),
        signal: controller.signal,
      });
      await readSSE(response, (event) => {
        if (gen !== runId.current || controller.signal.aborted) return;
        if (event.type === "meta") {
          accepted = true;
          setMessages((m) => [
            ...m,
            {
              id: uid,
              role: "user",
              content: text || "请解释这些笔迹",
              metadata: json({ hasInk: !!image }),
              status: "COMPLETE",
              createdAt: new Date().toISOString(),
            },
            {
              id: aid,
              role: "assistant",
              content: "",
              metadata: "{}",
              status: "STREAMING",
              createdAt: new Date().toISOString(),
            },
          ]);
          setDraft("");
          setAttachment(undefined);
        }
        if (event.type === "text") {
          answer += event.delta;
          setMessages((m) =>
            m.map((x) => (x.id === aid ? { ...x, content: answer } : x)),
          );
        }
        if (event.type === "tool") {
          if (pending.current) return;
          version.current = event.revision;
          setLab(event.state);
          setToolOutput(event.id + " · " + json(event.output));
          if (event.id === "TeachingPlan")
            setPlan(event.output as TeachingPlanData);
          setStatus("TOOL_EXECUTING");
        }
        if (event.type === "error") {
          setError(event.message);
          setStatus("ERROR_RECOVERY");
        }
        if (event.type === "done")
          setMessages((m) =>
            m.map((x) =>
              x.id === aid
                ? { ...x, status: "COMPLETE", id: event.messageId }
                : x,
            ),
          );
      });
      if (gen === runId.current && useClassroomUI.getState().speech && answer) {
        teacherVoice.speak(
          answer,
          useClassroomUI.getState().rate,
          useClassroomUI.getState().volume,
        );
      }
      onUpdated();
    } catch (e) {
      if (!controller.signal.aborted) setError(errorText(e));
      if (accepted)
        setMessages((m) =>
          m.map((x) => (x.id === aid ? { ...x, status: "INTERRUPTED" } : x)),
        );
    } finally {
      if (gen === runId.current) {
        setBusy(false);
        request.current = null;
        if (
          useClassroomUI.getState().status === "AI_THINKING" ||
          useClassroomUI.getState().status === "TOOL_EXECUTING"
        )
          setStatus("TEACHING");
      }
    }
  }
  if (!data || !lab)
    return (
      <div className="classroom-loading">
        <Spinner />
        <span>{error || "正在恢复课堂…"}</span>
        {error && (
          <button
            className="secondary"
            onClick={() => void load().catch((e) => setError(errorText(e)))}
          >
            重试
          </button>
        )}
      </div>
    );
  const subject = subjects.find((s) => s.id === data.subjectId)!;
  return (
    <div
      className={"classroom " + (!rightOpen ? "chat-hidden" : "")}
      style={{ "--subject-color": subject.color } as React.CSSProperties}
    >
      <main className="classroom-main">
        <header className="classroom-topbar">
          <div>
            <span className="breadcrumb">
              我的课堂 <span>/</span> {subject.name}
            </span>
            <h1>{data.title}</h1>
          </div>
          <div className="classroom-actions">
            <span className={"save-status " + (!saved ? "pending" : "")}>
              {saved ? <Check size={13} /> : <WifiOff size={13} />}{" "}
              {saved ? "已保存" : "保存中"}
            </span>
            <IconButton label="撤销实验操作" onClick={undoLab}>
              <Undo2 size={16} />
            </IconButton>
            <IconButton label="重做实验操作" onClick={redoLab}>
              <Redo2 size={16} />
            </IconButton>
            <IconButton
              label={rightOpen ? "收起教师面板" : "展开教师面板"}
              onClick={() => setRightOpen((v) => !v)}
            >
              {rightOpen ? (
                <PanelRightClose size={18} />
              ) : (
                <PanelRightOpen size={18} />
              )}
            </IconButton>
          </div>
        </header>
        <div className="lab-scroll">
          <div className="lab-section-tag">
            <span className="status-dot" /> 交互实验室{" "}
            <span className="muted">/</span> <span>{subject.en}</span>
            <span className="lab-edit-hint">你来操作，老师来引导</span>
          </div>
          {syncError && (
            <div className="sync-recovery">
              <ErrorNotice message={syncError} />
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    const c = await api<ClassroomData>(`/classrooms/${id}`);
                    version.current = c.visualization.revision;
                    await flush();
                  } catch (e) {
                    setSyncError(errorText(e));
                  }
                }}
              >
                以当前参数重新保存
              </button>
            </div>
          )}
          {labPresets[subject.id] && (
            <label className="lab-selector">
              实验工具
              <select
                aria-label="实验工具"
                value={lab.kind}
                onChange={(e) => {
                  const preset = labPresets[subject.id].find(
                    (p) => p.state.kind === e.target.value,
                  );
                  if (preset) changeLab(structuredClone(preset.state));
                }}
              >
                {labPresets[subject.id].map((p) => (
                  <option key={p.state.kind} value={p.state.kind}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {lab.kind === "graph" ? (
            <GraphLab state={lab} onChange={changeLab} />
          ) : lab.kind === "circuit" ? (
            <CircuitLab state={lab} onChange={changeLab} />
          ) : lab.kind === "atom" ? (
            <AtomLab state={lab} onChange={changeLab} />
          ) : lab.kind === "cell" ? (
            <CellLab state={lab} onChange={changeLab} />
          ) : lab.kind === "geometry" ? (
            <GeometryLab state={lab} onChange={changeLab} />
          ) : lab.kind === "motion" ? (
            <MotionLab state={lab} onChange={changeLab} />
          ) : lab.kind === "forces" ? (
            <ForceLab state={lab} onChange={changeLab} />
          ) : lab.kind === "optics" ? (
            <OpticsLab state={lab} onChange={changeLab} />
          ) : lab.kind === "molecule" ? (
            <MoleculeLab state={lab} onChange={changeLab} />
          ) : lab.kind === "dna" ? (
            <DnaLab state={lab} onChange={changeLab} />
          ) : (
            <ReadingLab
              state={lab}
              onChange={changeLab}
              english={subject.id === "english"}
            />
          )}
          {toolOutput && (
            <details className="tool-result">
              <summary>最近的工具计算结果</summary>
              <pre>{toolOutput}</pre>
            </details>
          )}
          <div className="exploration-note">
            <NotebookPen size={20} />
            <div>
              <b>试一试，再问为什么。</b>
              <p>{subject.hint}你的操作会成为老师下一次讲解的依据。</p>
            </div>
            <button className="text-button" onClick={openInk}>
              写下疑问 <ChevronDown size={14} />
            </button>
          </div>
        </div>
        <footer className="classroom-status">
          <span>
            <span className="status-dot" />
            学习，正在发生
          </span>
          <span>
            {subject.name}教室 ·{" "}
            {data.mode === "teach" ? "主动教学" : "自由探索"}
          </span>
          <button className="text-button" onClick={openInk}>
            全屏手写 <kbd>Ctrl Shift H</kbd>
          </button>
        </footer>
      </main>
      {rightOpen && (
        <div className="chat-resizable">
          <ChatPanel
            messages={messages}
            busy={busy}
            error={error}
            draft={draft}
            setDraft={setDraft}
            onSend={() => void send()}
            onInk={openInk}
            onVoice={openVoice}
            onInterrupt={interrupt}
            attachment={attachment}
            onClearAttachment={() => setAttachment(undefined)}
            onImage={setAttachment}
            subject={subject.name}
            teacherMode={data.mode}
            plan={plan}
            onPlanContinue={() =>
              void send({
                text: `我理解了当前教学步骤「${plan?.steps[plan.currentStep]}」，请更新进度并引导下一步。`,
                consent: false,
              })
            }
            onModeChange={async (mode) => {
              try {
                await api(`/classrooms/${id}`, {
                  method: "PATCH",
                  body: json({ mode }),
                });
                setData({ ...data, mode });
              } catch (e) {
                setError(errorText(e));
              }
            }}
          />
        </div>
      )}
      <AnimatePresence>
        {ink && (
          <Handwriting
            userId={user.id}
            classroom={data}
            onClose={() => {
              setInk(false);
              setStatus("INPUT_REVIEW");
              void api<ClassroomData>(`/classrooms/${id}`)
                .then((c) => setData(c))
                .catch(() => {});
            }}
            onSubmit={(value) => {
              setInk(false);
              setStatus("INPUT_REVIEW");
              const combined = {
                ...value,
                text: [draft, value.text].filter(Boolean).join("\n"),
              };
              setDraft(combined.text);
              setAttachment(value.image);
              void send(combined);
            }}
          />
        )}
      </AnimatePresence>
      {voice && (
        <VoiceReview
          onClose={() => {
            setVoice(false);
            setStatus("INPUT_REVIEW");
          }}
          onInsert={(text) => {
            setDraft((s) => [s, text].filter(Boolean).join("\n"));
            setVoice(false);
            setStatus("INPUT_REVIEW");
          }}
        />
      )}
    </div>
  );
}
