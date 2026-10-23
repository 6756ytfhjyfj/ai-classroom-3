import { useEffect, useRef, useState } from "react";
import {
  Send,
  PenLine,
  Mic,
  Square,
  Volume2,
  Pause,
  Play,
  X,
  Sparkles,
  ArrowUpRight,
  ImagePlus,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { ChatMessage, TeachingPlanData } from "../../shared/protocol";
import { useClassroomUI } from "../state/classroom";
import { teacherVoice } from "../services/speech";
import { IconButton, ErrorNotice } from "./ui";
export function ChatPanel({
  messages,
  busy,
  error,
  draft,
  setDraft,
  onSend,
  onInk,
  onVoice,
  onInterrupt,
  attachment,
  onClearAttachment,
  subject,
  teacherMode,
  onModeChange,
  plan,
  onPlanContinue,
  onImage,
}: {
  messages: ChatMessage[];
  busy: boolean;
  error: string;
  draft: string;
  setDraft: (v: string) => void;
  onSend: () => void;
  onInk: () => void;
  onVoice: () => void;
  onInterrupt: () => void;
  attachment?: string;
  onClearAttachment: () => void;
  subject: string;
  teacherMode: string;
  onModeChange: (m: "qa" | "teach") => void;
  plan: TeachingPlanData | null;
  onPlanContinue: () => void;
  onImage: (image: string) => void;
}) {
  const end = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null),
    imageInput = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState("");
  const status = useClassroomUI((s) => s.status),
    speech = useClassroomUI((s) => s.speech),
    setSpeech = useClassroomUI((s) => s.setSpeech),
    [paused, setPaused] = useState(false);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, messages.at(-1)?.content]);
  useEffect(() => {
    if (status === "AI_INTERRUPTED") input.current?.focus();
  }, [status]);
  return (
    <section className="chat-panel" aria-label="AI 教师">
      <header className="teacher-header">
        <div className="teacher-avatar">
          <Sparkles size={20} />
          <span />
        </div>
        <div>
          <b>{subject}老师</b>
          <small>耐心引导 · 一起探索</small>
        </div>
        <IconButton
          label={speech ? "关闭自动朗读" : "开启自动朗读"}
          onClick={() => {
            setSpeech(!speech);
            if (speech) teacherVoice.stop();
          }}
        >
          <Volume2 size={18} className={speech ? "accent-text" : "muted"} />
        </IconButton>
      </header>
      <div className="segmented mode-switch">
        <button
          className={teacherMode === "qa" ? "selected" : ""}
          onClick={() => onModeChange("qa")}
        >
          自由问答
        </button>
        <button
          className={teacherMode === "teach" ? "selected" : ""}
          onClick={() => onModeChange("teach")}
        >
          老师带我学
        </button>
      </div>
      <div className="chat-messages">
        {plan && (
          <details className="lesson-plan" open>
            <summary>本课目标 · {plan.goal}</summary>
            <ol>
              {plan.steps.map((step, i) => (
                <li
                  key={i}
                  className={
                    plan.completed.includes(i)
                      ? "completed"
                      : i === plan.currentStep
                        ? "current"
                        : ""
                  }
                >
                  {step}
                  <small>
                    {plan.completed.includes(i)
                      ? "已理解"
                      : i === plan.currentStep
                        ? "进行中"
                        : ""}
                  </small>
                </li>
              ))}
            </ol>
            <button
              className="secondary"
              disabled={busy}
              onClick={onPlanContinue}
            >
              我理解了，继续下一步
            </button>
          </details>
        )}
        {!messages.length ? (
          <div className="teacher-welcome">
            <span className="welcome-spark">
              <Sparkles size={25} />
            </span>
            <h3>每个问题，都是新的起点。</h3>
            <p>
              在画布上动手探索，或把你的疑问交给老师。可以打字、开口，也可以直接写下来。
            </p>
            <div className="welcome-prompt">
              <span>试着问问</span>
              {(subject === "数学"
                ? ["为什么 a 越大，抛物线越窄？", "带我理解二次函数的顶点"]
                : subject === "物理"
                  ? ["电阻变大，电流会怎样变化？", "帮我搭建一个串联电路"]
                  : subject === "化学"
                    ? ["为什么钠容易变成 Na⁺？", "配平 Fe + O2 → Fe2O3"]
                    : [
                        "我想学习这个学科，从哪里开始？",
                        "请根据当前画布给我一些提示",
                      ]
              ).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setDraft(t);
                    input.current?.focus();
                  }}
                >
                  {t}
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
            <small>
              AI 需由管理员配置后使用。
              <br />
              实验室与手写草稿可以先行探索。
            </small>
          </div>
        ) : (
          messages.map((m) => (
            <div className={"message " + m.role} key={m.id}>
              {m.role === "assistant" && (
                <span className="message-label">
                  <Sparkles size={12} />
                  老师
                </span>
              )}
              <div className="message-content">
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {m.content}
                </ReactMarkdown>
              </div>
              {JSON.parse(m.metadata || "{}").hasInk && (
                <small className="message-attachment">
                  <PenLine size={12} />
                  包含手写图片（原图不长期保存在聊天中）
                </small>
              )}
              {m.status === "INTERRUPTED" && (
                <small className="muted">讲解已打断，上文已保留</small>
              )}
              {m.role === "assistant" && m.content && (
                <button
                  className="message-read"
                  aria-label="朗读这段讲解"
                  onClick={() =>
                    teacherVoice.speak(
                      m.content,
                      useClassroomUI.getState().rate,
                      useClassroomUI.getState().volume,
                    )
                  }
                >
                  <Volume2 size={13} />
                </button>
              )}
            </div>
          ))
        )}
        {busy && (
          <div className="thinking">
            <i />
            <i />
            <i />
            <span>
              {status === "TOOL_EXECUTING" ? "正在演示实验" : "老师正在思考"}
            </span>
          </div>
        )}
        <div ref={end} />
      </div>
      {(busy || status === "AI_SPEAKING") && (
        <div className="interrupt-bar">
          <span className="status-dot" />
          <span>{busy ? "思考中，随时可以提问" : "老师正在讲解"}</span>
          {status === "AI_SPEAKING" && (
            <IconButton
              label={paused ? "继续朗读" : "暂停朗读"}
              onClick={() => {
                if (paused) teacherVoice.resume();
                else teacherVoice.pause();
                setPaused((v) => !v);
              }}
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </IconButton>
          )}
          <button
            onClick={() => {
              onInterrupt();
              input.current?.focus();
            }}
          >
            <Square size={12} />
            打断
          </button>
        </div>
      )}
      <div className="chat-composer">
        <ErrorNotice message={error} />
        <ErrorNotice message={imageError} />
        <input
          ref={imageInput}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              if (file.size > 10 * 1024 * 1024)
                throw new Error("图片最大为10MB");
              const bitmap = await createImageBitmap(file),
                scale = Math.min(
                  1,
                  1800 / Math.max(bitmap.width, bitmap.height),
                ),
                canvas = document.createElement("canvas");
              canvas.width = bitmap.width * scale;
              canvas.height = bitmap.height * scale;
              const ctx = canvas.getContext("2d")!;
              ctx.fillStyle = "white";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
              bitmap.close();
              onImage(canvas.toDataURL("image/png"));
              setImageError("");
            } catch (err) {
              setImageError(
                err instanceof Error ? err.message : "无法读取图片",
              );
            }
            e.target.value = "";
          }}
        />
        {attachment && (
          <div className="pending-attachment">
            <img src={attachment} alt="待提交手写笔迹" />
            <span>待发送图片 · 点击发送后交给配置的云端模型</span>
            <IconButton label="移除待提交笔迹" onClick={onClearAttachment}>
              <X size={14} />
            </IconButton>
          </div>
        )}
        <div className="composer-box">
          <textarea
            ref={input}
            aria-label="向老师提问"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.ctrlKey && e.key === "Enter") {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="把你的好奇，交给老师…"
            rows={3}
          />
          <div className="composer-tools">
            <div>
              <button title="全屏手写 Ctrl+Shift+H" onClick={onInk}>
                <PenLine size={17} />
                <span>手写</span>
              </button>
              <button title="语音提问 Ctrl+Shift+M" onClick={onVoice}>
                <Mic size={17} />
                <span>语音</span>
              </button>
              <button
                title="添加图片，发送前留在本机"
                aria-label="添加图片"
                onClick={() => imageInput.current?.click()}
              >
                <ImagePlus size={17} />
              </button>
            </div>
            <button
              className="send-button"
              aria-label="发送问题"
              onClick={onSend}
              disabled={busy || (!draft.trim() && !attachment)}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
        <p className="composer-foot">
          Ctrl + Enter 发送 <span>AI 也会犯错，一起求证。</span>
        </p>
      </div>
    </section>
  );
}
