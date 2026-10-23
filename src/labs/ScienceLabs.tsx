import type { LabState } from "../../shared/protocol";
import { atomInfo, elements, balanceEquation } from "../../shared/solvers";
import { useState } from "react";
import { ArrowRight, Volume2 } from "lucide-react";
import { teacherVoice } from "../services/speech";
import { ErrorNotice, errorText } from "../components/ui";
export function AtomLab({
  state,
  onChange,
}: {
  state: Extract<LabState, { kind: "atom" }>;
  onChange: (s: LabState) => void;
}) {
  const atom = atomInfo(state.element, state.ion),
    [eq, setEq] = useState(""),
    [balanced, setBalanced] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="atom-lab">
      <div className="lab-title-row">
        <div>
          <span className="eyebrow">THE INVISIBLE, MADE VISIBLE</span>
          <h2>走进原子的微观世界。</h2>
          <p>观察电子得失，理解原子与离子的联系。</p>
        </div>
        <select
          aria-label="选择元素"
          value={state.element}
          onChange={(e) =>
            onChange({
              ...state,
              element: e.target.value as typeof state.element,
              ion: false,
            })
          }
        >
          {Object.entries(elements).map(([id, e]) => (
            <option key={id} value={id}>
              {id} · {e.name}
            </option>
          ))}
        </select>
      </div>
      <div className="atom-stage">
        <svg
          viewBox="0 0 700 420"
          role="img"
          aria-label={`${atom.name}电子层教学模型`}
        >
          <defs>
            <radialGradient id="nucleus">
              <stop stopColor="#a6d9c5" />
              <stop offset="1" stopColor="#64a98f" />
            </radialGradient>
          </defs>
          {atom.shells.map((n, i) => (
            <g key={i}>
              <circle
                cx="350"
                cy="210"
                r={75 + i * 55}
                fill="none"
                stroke="var(--border)"
                strokeWidth="1.5"
              />
              {Array.from({ length: n }, (_, j) => {
                const angle = (j / n) * Math.PI * 2 - i * 0.7,
                  x = 350 + Math.cos(angle) * (75 + i * 55),
                  y = 210 + Math.sin(angle) * (75 + i * 55);
                return (
                  <circle
                    key={j}
                    cx={x}
                    cy={y}
                    r="6"
                    fill={i === atom.shells.length - 1 ? "#74bea2" : "#b2c6b9"}
                    className="electron"
                  />
                );
              })}
            </g>
          ))}
          <circle cx="350" cy="210" r="42" fill="url(#nucleus)" />
          <text
            x="350"
            y="217"
            textAnchor="middle"
            fill="white"
            fontSize="27"
            fontFamily="Georgia"
          >
            {state.element}
            <tspan baselineShift="super" fontSize="14">
              {atom.charge
                ? `${Math.abs(atom.charge) === 1 ? "" : Math.abs(atom.charge)}${atom.charge > 0 ? "+" : "−"}`
                : ""}
            </tspan>
          </text>
        </svg>
        <div className="atom-data">
          <span>
            原子序数<strong>{atom.z}</strong>
          </span>
          <span>
            电子数量<strong>{atom.electrons}</strong>
          </span>
          <span>
            电子层排布<strong>{atom.shells.join(" · ")}</strong>
          </span>
          <span>
            净电荷
            <strong>
              {atom.charge > 0 ? "+" : ""}
              {atom.charge}
            </strong>
          </span>
        </div>
      </div>
      <div className="ion-action">
        <div>
          <b>{state.ion ? "离子状态" : "中性原子"}</b>
          <p>
            {atom.name}
            {atomInfo(state.element, true).charge > 0
              ? "失去电子可形成阳离子"
              : atomInfo(state.element, true).charge < 0
                ? "得到电子可形成阴离子"
                : "的常见化学行为需要结合成键讨论"}
          </p>
        </div>
        <button
          className="primary"
          disabled={state.element === "C"}
          onClick={() => onChange({ ...state, ion: !state.ion })}
        >
          {state.ion ? "还原为原子" : "演示离子形成"}
          <ArrowRight size={17} />
        </button>
      </div>
      <p className="lab-footnote">
        {atom.model}。稳定性还取决于能量、反应环境和化学键，不能仅由电子层判断。
      </p>
      <div className="balance-panel">
        <b>质量守恒 · 方程式配平</b>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              setBalanced(balanceEquation(eq).equation);
              setError("");
            } catch (err) {
              setError(errorText(err));
            }
          }}
        >
          <input
            value={eq}
            onChange={(e) => setEq(e.target.value)}
            placeholder="例如 Fe + O2 -> Fe2O3"
            required
          />
          <button className="secondary">配平</button>
        </form>
        {balanced && <output>{balanced}</output>}
        <ErrorNotice message={error} />
      </div>
    </div>
  );
}
const organelles = {
  membrane: {
    name: "细胞膜",
    text: "选择性控制物质进出，参与细胞间的信息交流。",
  },
  cytoplasm: {
    name: "细胞质",
    text: "细胞质基质和细胞器共同构成细胞质，许多代谢反应在此发生。",
  },
  nucleus: {
    name: "细胞核",
    text: "储存遗传物质，参与调控细胞的代谢、生长和分裂。",
  },
  mitochondria: {
    name: "线粒体",
    text: "真核细胞有氧呼吸的主要场所之一，通过氧化磷酸化合成 ATP。",
  },
};
export function CellLab({
  state,
  onChange,
}: {
  state: Extract<LabState, { kind: "cell" }>;
  onChange: (s: LabState) => void;
}) {
  return (
    <div className="cell-lab">
      <div className="lab-title-row">
        <div>
          <span className="eyebrow">LIFE UNDER THE LENS</span>
          <h2>生命的细节，值得放大。</h2>
          <p>点击结构，探索动物细胞的基本组成。</p>
        </div>
      </div>
      <svg viewBox="0 0 700 430" role="img" aria-label="动物细胞二维教学模型">
        <ellipse
          cx="350"
          cy="210"
          rx="250"
          ry="170"
          fill="var(--mint-soft)"
          stroke="#86baa7"
          strokeWidth={state.selected === "membrane" ? 6 : 3}
          onClick={() => onChange({ ...state, selected: "membrane" })}
        />
        <ellipse
          cx="350"
          cy="210"
          rx="230"
          ry="150"
          fill="transparent"
          onClick={() => onChange({ ...state, selected: "cytoplasm" })}
        />
        <ellipse
          cx="350"
          cy="215"
          rx="83"
          ry="70"
          fill="#bcc4e5"
          stroke={state.selected === "nucleus" ? "#7381f7" : "#9ca6cd"}
          strokeWidth="4"
          onClick={() => onChange({ ...state, selected: "nucleus" })}
        />
        <circle cx="367" cy="211" r="21" fill="#8996c2" pointerEvents="none" />
        {[
          [200, 150],
          [480, 160],
          [225, 285],
          [470, 285],
        ].map(([x, y], i) => (
          <g
            key={i}
            onClick={() => onChange({ ...state, selected: "mitochondria" })}
          >
            <ellipse
              cx={x}
              cy={y}
              rx="36"
              ry="19"
              transform={`rotate(${i * 30} ${x} ${y})`}
              fill="#e3ba96"
              stroke={state.selected === "mitochondria" ? "#d49d6e" : "#cea781"}
              strokeWidth="3"
            />
            <path
              d={`M${x - 22} ${y}q8 -15 15 0t15 0t15 0`}
              fill="none"
              stroke="#b88860"
            />
          </g>
        ))}
        <text
          x="350"
          y="410"
          textAnchor="middle"
          fill="var(--muted)"
          fontSize="13"
        >
          动物细胞 · 二维教学示意，大小与数量不按真实比例
        </text>
      </svg>
      <div className="organelle-tabs">
        {Object.entries(organelles).map(([id, o]) => (
          <button
            className={state.selected === id ? "active" : ""}
            key={id}
            onClick={() =>
              onChange({ ...state, selected: id as typeof state.selected })
            }
          >
            {o.name}
          </button>
        ))}
      </div>
      <div className="concept-card">
        <b>{organelles[state.selected].name}</b>
        <p>{organelles[state.selected].text}</p>
      </div>
    </div>
  );
}
export function ReadingLab({
  state,
  onChange,
  english,
}: {
  state: Extract<LabState, { kind: "reading" }>;
  onChange: (s: LabState) => void;
  english: boolean;
}) {
  return (
    <div className="reading-lab">
      <div className="lab-title-row">
        <div>
          <span className="eyebrow">
            {english ? "WORDS OPEN WORLDS" : "READ BETWEEN THE LINES"}
          </span>
          <h2>
            {english ? "让每一句，都有所收获。" : "在字里行间，找到你的理解。"}
          </h2>
          <p>
            {english
              ? "放入英文句子，请老师讲解或练习朗读。"
              : "放入阅读材料，记录思路，与老师一起深入文本。"}
          </p>
        </div>
      </div>
      <label className="canvas-label">
        {english ? "英文材料" : "阅读原文"}
        <textarea
          value={state.text}
          maxLength={15000}
          onChange={(e) => onChange({ ...state, text: e.target.value })}
          placeholder={
            english
              ? "Type a sentence or paste your reading passage…"
              : "粘贴你想阅读的文章、诗歌，或写下一段文字……"
          }
        />
      </label>
      {english && (
        <button
          className="secondary"
          disabled={!state.text}
          onClick={() => {
            teacherVoice.stop();
            const u = new SpeechSynthesisUtterance(state.text);
            u.lang = "en-US";
            speechSynthesis.speak(u);
          }}
        >
          <Volume2 size={16} />
          系统语音朗读
        </button>
      )}
      <label className="canvas-label">
        我的思考与笔记
        <textarea
          value={state.notes}
          maxLength={10000}
          onChange={(e) => onChange({ ...state, notes: e.target.value })}
          placeholder="你的观察、疑问与新发现，会和课堂一起保存。"
        />
      </label>
      <p className="lab-footnote">
        原文与笔记会在向 AI 提问时作为当前课堂上下文发送。朗读使用系统语音。
      </p>
    </div>
  );
}
