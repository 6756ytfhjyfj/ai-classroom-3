import { useEffect, useRef, useState } from "react";
import { Mic, Square, Check, X, AudioLines } from "lucide-react";
import { Modal, ErrorNotice, errorText } from "./ui";
import { teacherVoice } from "../services/speech";
import { useClassroomUI } from "../state/classroom";
import { api } from "../services/api";
export function VoiceReview({
  onInsert,
  onClose,
}: {
  onInsert: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(""),
    [partial, setPartial] = useState(""),
    [recording, setRecording] = useState(false),
    [error, setError] = useState(""),
    [language, setLanguage] = useState("zh-CN"),
    [hold, setHold] = useState(false),
    [consent, setConsent] = useState(false),
    [starting, setStarting] = useState(false);
  const stream = useRef<MediaStream | null>(null),
    audio = useRef<AudioContext | null>(null),
    recognizer = useRef<SpeechRecognitionLike | null>(null),
    unsubscribe = useRef<(() => void) | null>(null),
    frame = useRef(0),
    bars = useRef<HTMLDivElement>(null),
    generation = useRef(0),
    mounted = useRef(true);
  const setStatus = useClassroomUI((s) => s.setStatus);
  const stop = () => {
    generation.current++;
    recognizer.current?.stop();
    recognizer.current = null;
    void window.desktop?.speechStop();
    unsubscribe.current?.();
    unsubscribe.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audio.current?.close();
    audio.current = null;
    cancelAnimationFrame(frame.current);
    if (mounted.current) {
      setRecording(false);
      setStarting(false);
      setStatus("INPUT_REVIEW");
    }
  };
  useEffect(() => {
    teacherVoice.stop();
    void api<{ speechConfig: string | null }>("/capabilities")
      .then((r) => {
        if (r.speechConfig && mounted.current)
          setLanguage(JSON.parse(r.speechConfig).language ?? "zh-CN");
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
      stop();
    };
  }, []);
  async function start() {
    if (starting || recording) return;
    teacherVoice.stop();
    setError("");
    if (!window.desktop && !consent) {
      setError(
        "浏览器系统识别可能将音频发送给系统语音服务，请先授权。Windows 桌面版本使用本地识别。",
      );
      return;
    }
    const gen = ++generation.current;
    setStarting(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (gen !== generation.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      const ctx = new AudioContext();
      audio.current = ctx;
      const source = ctx.createMediaStreamSource(s),
        analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const render = () => {
        analyser.getByteFrequencyData(data);
        if (bars.current)
          Array.from(bars.current.children).forEach((el, i) => {
            (el as HTMLElement).style.height =
              4 + (data[(i * 3) % data.length] / 255) * 50 + "px";
          });
        frame.current = requestAnimationFrame(render);
      };
      render();
      if (window.desktop) {
        unsubscribe.current = window.desktop.speechSubscribe((e) => {
          if (gen !== generation.current) return;
          if (e.type === "partial") setPartial(e.text ?? "");
          if (e.type === "final") {
            setText((t) => t + (t ? " " : "") + (e.text ?? ""));
            setPartial("");
          }
          if (e.type === "error") {
            setError(e.message ?? "本地语音识别失败，请检查语言包");
            stop();
          }
          if (e.type === "end") stop();
        });
        await window.desktop.speechStart(language);
      } else {
        const Constructor =
          window.SpeechRecognition ?? window.webkitSpeechRecognition;
        if (!Constructor)
          throw new Error(
            "当前环境不提供语音识别，请使用 Windows 桌面版、键盘或手写",
          );
        const r = new Constructor();
        r.lang = language;
        r.continuous = true;
        r.interimResults = true;
        r.onresult = (e) => {
          let live = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal)
              setText((t) => t + (t ? " " : "") + e.results[i][0].transcript);
            else live += e.results[i][0].transcript;
          }
          setPartial(live);
        };
        r.onerror = (e) => {
          setError("语音识别不可用：" + e.error + "。可保留文字后改用键盘。");
          stop();
        };
        r.onend = () => stop();
        recognizer.current = r;
        r.start();
      }
      if (gen === generation.current) {
        setRecording(true);
        setStarting(false);
        setStatus("VOICE_LISTENING");
      }
    } catch (e) {
      setError(errorText(e));
      stop();
    }
  }
  return (
    <Modal
      title="把问题，说出来。"
      onClose={() => {
        stop();
        onClose();
      }}
    >
      <p className="muted">
        {window.desktop
          ? "Windows 本地语音识别 · 不保存原始录音"
          : "系统语音识别 · 是否可用取决于浏览器与系统"}
      </p>
      <div className="voice-settings">
        <select
          aria-label="识别语言"
          disabled={recording}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="zh-CN">普通话</option>
          <option value="en-US">English</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={hold}
            disabled={recording}
            onChange={(e) => setHold(e.target.checked)}
          />
          按住说话
        </label>
      </div>
      {!window.desktop && (
        <label className="check cloud-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          我同意系统语音服务处理本次音频
        </label>
      )}
      <div className={"voice-wave " + (recording ? "listening" : "")}>
        <div className="wave-bars" ref={bars}>
          {Array.from({ length: 32 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        <small>
          {starting
            ? "正在打开麦克风…"
            : recording
              ? "正在聆听，随时可以结束"
              : text
                ? "识别完成，检查后添加到问题"
                : "麦克风尚未开启"}
        </small>
      </div>
      <div className="voice-actions">
        <button
          className={"record-button " + (recording ? "recording" : "")}
          disabled={starting}
          onClick={() => {
            if (!hold) {
              if (recording) stop();
              else void start();
            }
          }}
          onPointerDown={(e) => {
            if (hold) {
              e.currentTarget.setPointerCapture(e.pointerId);
              void start();
            }
          }}
          onPointerUp={() => {
            if (hold) stop();
          }}
          onPointerCancel={() => {
            if (hold) stop();
          }}
        >
          {recording ? <Square size={22} /> : <Mic size={24} />}
        </button>
        <span>
          {hold
            ? "按住录音，松开结束"
            : recording
              ? "点击结束录音"
              : "点击开始说话"}
        </span>
      </div>
      <label>
        确认识别文字
        <textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="识别文字会出现在这里，可修改公式与专有名词。"
        />
      </label>
      {partial && (
        <p className="partial-text">
          <AudioLines size={14} />
          {partial}…（候选）
          {!recording && (
            <button
              className="text-button"
              onClick={() => {
                setText((s) => s + (s ? " " : "") + partial);
                setPartial("");
              }}
            >
              采用候选
            </button>
          )}
        </p>
      )}
      <ErrorNotice message={error} />
      <div className="modal-actions">
        <button
          className="secondary"
          onClick={() => {
            stop();
            onClose();
          }}
        >
          <X size={16} />
          取消
        </button>
        <button
          className="primary"
          disabled={!text.trim() || recording}
          onClick={() => {
            stop();
            onInsert(text.trim());
          }}
        >
          <Check size={16} />
          添加到问题
        </button>
      </div>
      <small className="muted">
        默认不会自动发送。数学符号和中英文混读请检查候选文字。
      </small>
    </Modal>
  );
}
