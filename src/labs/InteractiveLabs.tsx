import { useEffect, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import type { LabState } from "../../shared/protocol";
import {
  projectile,
  lens,
  geometry,
  dnaComplement,
} from "../../shared/science";
type Props = { state: LabState; onChange: (s: LabState) => void };
function LabHeading({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="lab-title-row">
      <div>
        <span className="eyebrow">{label}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}
export function GeometryLab({ state, onChange }: Props) {
  if (state.kind !== "geometry") return null;
  const result = geometry(state.points);
  return (
    <>
      <LabHeading
        label="GEOMETRY CANVAS"
        title="每一次拖动，都有新的关系。"
        description="拖动多边形顶点，观察边长、周长与面积。"
      />
      <svg
        className="interactive-stage"
        viewBox="0 0 700 440"
        role="img"
        aria-label="可拖动几何画布"
      >
        <defs>
          <pattern
            id="geo-grid"
            width="30"
            height="30"
            patternUnits="userSpaceOnUse"
            x="350"
            y="220"
          >
            <path d="M30 0H0V30" fill="none" stroke="var(--grid)" />
          </pattern>
        </defs>
        <rect width="700" height="440" fill="url(#geo-grid)" />
        <path d="M20 220H680 M350 20V420" stroke="var(--axis)" />
        <polygon
          points={state.points
            .map((p) => `${350 + p.x * 30},${220 - p.y * 30}`)
            .join(" ")}
          fill="var(--accent-soft)"
          stroke="var(--accent)"
          strokeWidth="2"
        />
        {state.points.map((p, i) => (
          <g key={i}>
            <circle
              cx={350 + p.x * 30}
              cy={220 - p.y * 30}
              r="8"
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth="3"
              className="geo-point"
              onPointerDown={(e) =>
                e.currentTarget.setPointerCapture(e.pointerId)
              }
              onPointerMove={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                const svg = e.currentTarget.ownerSVGElement!,
                  pt = svg.createSVGPoint();
                pt.x = e.clientX;
                pt.y = e.clientY;
                const v = pt.matrixTransform(svg.getScreenCTM()!.inverse());
                onChange({
                  ...state,
                  points: state.points.map((q, j) =>
                    j === i
                      ? {
                          x: Math.max(-10, Math.min(10, (v.x - 350) / 30)),
                          y: Math.max(-7, Math.min(7, (220 - v.y) / 30)),
                        }
                      : q,
                  ),
                });
              }}
              onPointerUp={(e) =>
                e.currentTarget.releasePointerCapture(e.pointerId)
              }
            />
            <text
              x={360 + p.x * 30}
              y={206 - p.y * 30}
              fill="var(--muted)"
              fontSize="13"
            >
              {String.fromCharCode(65 + i)} ({p.x.toFixed(1)}, {p.y.toFixed(1)})
            </text>
          </g>
        ))}
      </svg>
      <div className="measurement-cards">
        <div>
          <small>面积</small>
          <strong>{result.area.toFixed(2)}</strong>
        </div>
        <div>
          <small>周长</small>
          <strong>{result.perimeter.toFixed(2)}</strong>
        </div>
        {result.edges.map((n, i) => (
          <div key={i}>
            <small>
              边 {String.fromCharCode(65 + i)}
              {String.fromCharCode(65 + ((i + 1) % state.points.length))}
            </small>
            <strong>{n.toFixed(2)}</strong>
          </div>
        ))}
      </div>
      <p className="lab-footnote">{result.model}。网格单位为抽象长度单位。</p>
    </>
  );
}
export function MotionLab({ state, onChange }: Props) {
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false);
  const motion = state.kind === "motion" ? state : null;
  useEffect(() => {
    setTime(motion?.time ?? 0);
    setPlaying(false);
  }, [motion?.time, motion?.speed, motion?.angle, motion?.gravity]);
  useEffect(() => {
    if (!playing || !motion) return;
    let last = performance.now(),
      frame = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => Math.min(30, t + dt));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, motion?.speed, motion?.angle, motion?.gravity]);
  if (!motion) return null;
  const result = projectile(motion.speed, motion.angle, motion.gravity, time),
    scale = Math.min(
      22,
      600 / Math.max(result.range, 10),
      300 / Math.max(result.maxHeight, 6),
    );
  const trajectory = Array.from({ length: 101 }, (_, i) => {
    const p = projectile(
      motion.speed,
      motion.angle,
      motion.gravity,
      (result.flight * i) / 100,
    );
    return `${i ? "L" : "M"}${40 + p.x * scale},${370 - p.y * scale}`;
  }).join(" ");
  return (
    <>
      <LabHeading
        label="MOTION SIMULATOR"
        title="让运动，留下可测量的轨迹。"
        description="理想抛体模型：无空气阻力、重力恒定，从同一高度出发和落地。"
      />
      <svg
        className="interactive-stage"
        viewBox="0 0 700 440"
        role="img"
        aria-label="抛体运动模拟"
      >
        <path d="M30 370H680 M40 400V30" stroke="var(--axis)" />
        <path
          d={trajectory}
          stroke="var(--accent)"
          strokeDasharray="5 6"
          strokeWidth="2"
          fill="none"
        />
        <circle
          cx={40 + result.x * scale}
          cy={370 - result.y * scale}
          r="11"
          fill="var(--accent)"
        />
        <text x="540" y="410" fill="var(--muted)" fontSize="13">
          t = {Math.min(time, result.flight).toFixed(2)} s
        </text>
      </svg>
      <div className="simulation-controls">
        <button
          className="secondary"
          onClick={() => {
            if (playing) {
              setPlaying(false);
              onChange({ ...motion, time: Math.min(time, result.flight) });
            } else {
              if (time >= result.flight) setTime(0);
              setPlaying(true);
            }
          }}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}{" "}
          {playing ? "暂停并保存时刻" : "播放轨迹"}
        </button>
        <button
          className="text-button"
          onClick={() => {
            setPlaying(false);
            setTime(0);
            onChange({ ...motion, time: 0 });
          }}
        >
          <RotateCcw size={14} />
          重置
        </button>
      </div>
      <div className="parameter-sliders science-parameters">
        {(
          [
            { key: "speed", label: "初速度 / m·s⁻¹", min: 0, max: 40 },
            { key: "angle", label: "抛射角 / °", min: 0, max: 90 },
            { key: "gravity", label: "重力加速度 / m·s⁻²", min: 0.1, max: 25 },
          ] as const
        ).map((p) => (
          <label key={p.key}>
            {p.label} · {motion[p.key].toFixed(1)}
            <input
              type="range"
              min={p.min}
              max={p.max}
              step=".1"
              value={motion[p.key]}
              onChange={(e) =>
                onChange({
                  ...motion,
                  [p.key]: Number(e.target.value),
                  time: 0,
                })
              }
            />
          </label>
        ))}
      </div>
      <div className="measurement-cards">
        <div>
          <small>水平位移 / m</small>
          <strong>{result.x.toFixed(2)}</strong>
        </div>
        <div>
          <small>高度 / m</small>
          <strong>{result.y.toFixed(2)}</strong>
        </div>
        <div>
          <small>射程 / m</small>
          <strong>{result.range.toFixed(2)}</strong>
        </div>
        <div>
          <small>飞行时间 / s</small>
          <strong>{result.flight.toFixed(2)}</strong>
        </div>
      </div>
      <p className="lab-footnote">
        暂停会将当前时刻保存到课堂，供 AI 读取。播放过程为本地演示。
      </p>
    </>
  );
}
export function ForceLab({ state, onChange }: Props) {
  if (state.kind !== "forces") return null;
  const sum = state.vectors.reduce((s, v) => ({ x: s.x + v.x, y: s.y + v.y }), {
      x: 0,
      y: 0,
    }),
    scale =
      150 /
      Math.max(
        5,
        ...state.vectors.flatMap((v) => [Math.abs(v.x), Math.abs(v.y)]),
        Math.abs(sum.x),
        Math.abs(sum.y),
      );
  return (
    <>
      <LabHeading
        label="FORCE VISUALIZER"
        title="看见每一份力，也看见合力。"
        description="二维共点力向量合成。方向由 x/y 分量确定，单位为 N。"
      />
      <svg
        className="interactive-stage"
        viewBox="0 0 700 420"
        role="img"
        aria-label="力向量合成"
      >
        <defs>
          <marker
            id="force-arrow"
            markerWidth="7"
            markerHeight="7"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="M0 0L6 3L0 6Z" fill="context-stroke" />
          </marker>
        </defs>
        <path d="M50 220H650 M350 30V390" stroke="var(--axis)" />
        {[...state.vectors, sum].map((v, i) => (
          <g key={i}>
            <path
              d={`M350 220L${350 + v.x * scale} ${220 - v.y * scale}`}
              fill="none"
              stroke={
                i === state.vectors.length
                  ? "#d39f64"
                  : i % 2
                    ? "#8fb7a4"
                    : "var(--accent)"
              }
              strokeWidth={i === state.vectors.length ? 3 : 2}
              markerEnd="url(#force-arrow)"
            />
            <text
              x={360 + v.x * scale}
              y={210 - v.y * scale}
              fill="var(--muted)"
              fontSize="12"
            >
              {i === state.vectors.length ? "ΣF" : "F" + (i + 1)}
            </text>
          </g>
        ))}
      </svg>
      <div className="vector-controls">
        {state.vectors.map((v, i) => (
          <div key={i}>
            <b>F{i + 1}</b>
            {(["x", "y"] as const).map((k) => (
              <label key={k}>
                {k}
                <input
                  type="number"
                  min="-100"
                  max="100"
                  value={v[k]}
                  onChange={(e) =>
                    onChange({
                      ...state,
                      vectors: state.vectors.map((v, j) =>
                        j === i
                          ? {
                              ...v,
                              [k]: Math.max(
                                -100,
                                Math.min(100, Number(e.target.value)),
                              ),
                            }
                          : v,
                      ),
                    })
                  }
                />
              </label>
            ))}
          </div>
        ))}
      </div>
      <div className="concept-card">
        <b>
          ΣF = ({sum.x.toFixed(2)}, {sum.y.toFixed(2)}) N
        </b>
        <p>
          合力大小 {Math.hypot(sum.x, sum.y).toFixed(3)} N；与 x 轴夹角{" "}
          {((Math.atan2(sum.y, sum.x) * 180) / Math.PI).toFixed(2)}°。
        </p>
      </div>
    </>
  );
}
export function OpticsLab({ state, onChange }: Props) {
  if (state.kind !== "optics") return null;
  const r = lens(state.focal, state.distance, state.height),
    scale = 9,
    ox = 350,
    oy = 220,
    objX = ox - state.distance * scale,
    objY = oy - state.height * scale;
  return (
    <>
      <LabHeading
        label="OPTICS LAB"
        title="光走过的路，解释像的形成。"
        description="理想凸薄透镜与近轴光线模型；物距、焦距单位为 cm。"
      />
      <svg
        className="interactive-stage"
        viewBox="0 0 700 420"
        role="img"
        aria-label="凸透镜成像图"
      >
        <defs>
          <clipPath id="optics-clip">
            <rect width="700" height="420" />
          </clipPath>
        </defs>
        <path d="M10 220H690" stroke="var(--axis)" />
        <ellipse
          cx="350"
          cy="220"
          rx="10"
          ry="155"
          fill="var(--accent-soft)"
          stroke="var(--accent)"
        />
        <g clipPath="url(#optics-clip)">
          <path d={`M${objX} ${oy}V${objY}`} stroke="#8ab59f" strokeWidth="5" />
          <path
            d={`M${objX} ${objY}H350L690 ${objY + ((690 - ox) * state.height) / state.focal}`}
            stroke="#d6b178"
            fill="none"
            strokeWidth="1.7"
          />
          <path
            d={`M${objX} ${objY}L690 ${oy + ((690 - ox) * state.height) / state.distance}`}
            stroke="#d6b178"
            fill="none"
            strokeWidth="1.7"
          />
          {r.imageDistance !== null && Math.abs(r.imageDistance) < 100 && (
            <>
              <path
                d={`M${ox + r.imageDistance * scale} ${oy}V${oy - r.imageHeight! * scale}`}
                stroke="#ca929e"
                strokeWidth="4"
                strokeDasharray={r.imageDistance < 0 ? "5 4" : undefined}
              />
              {r.imageDistance < 0 && (
                <path
                  d={`M350 ${objY}L${ox + r.imageDistance * scale} ${oy - r.imageHeight! * scale}`}
                  stroke="#d6b178"
                  strokeDasharray="5 4"
                  fill="none"
                />
              )}
            </>
          )}
        </g>
        {[-2, -1, 1, 2].map((n) => (
          <g key={n}>
            <circle
              cx={ox + n * state.focal * scale}
              cy={oy}
              r="3"
              fill="var(--axis)"
            />
            <text
              x={ox + n * state.focal * scale}
              y="245"
              textAnchor="middle"
              fontSize="12"
              fill="var(--muted)"
            >
              {Math.abs(n) === 2 ? "2F" : "F"}
            </text>
          </g>
        ))}
      </svg>
      <div className="parameter-sliders science-parameters">
        {(
          [
            { key: "focal", label: "焦距 f", min: 1, max: 15 },
            { key: "distance", label: "物距 u", min: 1, max: 35 },
            { key: "height", label: "物高", min: 0.5, max: 5 },
          ] as const
        ).map((p) => (
          <label key={p.key}>
            {p.label} · {state[p.key].toFixed(1)} cm
            <input
              type="range"
              min={p.min}
              max={p.max}
              step=".1"
              value={state[p.key]}
              onChange={(e) =>
                onChange({ ...state, [p.key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
      </div>
      <div className="concept-card">
        <b>{r.kind}</b>
        <p>
          1/f = 1/u + 1/v；
          {r.imageDistance === null
            ? "物体处于焦点，像在无穷远"
            : `像距 v = ${r.imageDistance.toFixed(2)} cm，放大率 m = ${r.magnification!.toFixed(2)}`}
          。超出画布的像不显示，计算值仍有效。
        </p>
      </div>
    </>
  );
}
const moleculeModels = {
  H2O: {
    atoms: [
      ["O", 0, 0, 0],
      ["H", -0.79, 0.61, 0],
      ["H", 0.79, 0.61, 0],
    ],
    bonds: [
      [0, 1],
      [0, 2],
    ],
    note: "水分子的弯曲构型，键角约104.5°",
  },
  CO2: {
    atoms: [
      ["C", 0, 0, 0],
      ["O", -1.16, 0, 0],
      ["O", 1.16, 0, 0],
    ],
    bonds: [
      [0, 1],
      [0, 2],
    ],
    note: "二氧化碳的线性构型；双键以单条棒示意",
  },
  CH4: {
    atoms: [
      ["C", 0, 0, 0],
      ["H", 0.63, 0.63, 0.63],
      ["H", -0.63, -0.63, 0.63],
      ["H", -0.63, 0.63, -0.63],
      ["H", 0.63, -0.63, -0.63],
    ],
    bonds: [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
    note: "甲烷正四面体构型，键角约109.5°",
  },
  O2: {
    atoms: [
      ["O", -0.6, 0, 0],
      ["O", 0.6, 0, 0],
    ],
    bonds: [[0, 1]],
    note: "氧气双原子分子，双键以单条棒示意",
  },
};
export function MoleculeLab({ state, onChange }: Props) {
  const [rotation, setRotation] = useState({ x: 0.4, y: 0.5 });
  if (state.kind !== "molecule") return null;
  const model = moleculeModels[state.formula];
  const atoms = model.atoms.map(([symbol, x, y, z], i) => {
    const px =
        Number(x) * Math.cos(rotation.y) + Number(z) * Math.sin(rotation.y),
      pz = -Number(x) * Math.sin(rotation.y) + Number(z) * Math.cos(rotation.y),
      py = Number(y) * Math.cos(rotation.x) - pz * Math.sin(rotation.x),
      depth = Number(y) * Math.sin(rotation.x) + pz * Math.cos(rotation.x),
      scale = 1 / (1 + depth * 0.14);
    return {
      i,
      symbol: String(symbol),
      x: 350 + px * 110 * scale,
      y: 210 + py * 110 * scale,
      z: depth,
      scale,
    };
  });
  return (
    <>
      <LabHeading
        label="MOLECULE VIEWER"
        title="换个角度，理解空间中的化学。"
        description="拖动旋转三维球棍教学模型；元素颜色：氧红、碳灰、氢白。"
      />
      <select
        aria-label="分子"
        value={state.formula}
        onChange={(e) =>
          onChange({
            ...state,
            formula: e.target.value as typeof state.formula,
          })
        }
      >
        {Object.keys(moleculeModels).map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <svg
        className="interactive-stage molecule-stage"
        viewBox="0 0 700 420"
        role="img"
        aria-label="可旋转分子三维投影"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.dataset.x = String(e.clientX);
          e.currentTarget.dataset.y = String(e.clientY);
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          const dx = e.clientX - Number(e.currentTarget.dataset.x),
            dy = e.clientY - Number(e.currentTarget.dataset.y);
          e.currentTarget.dataset.x = String(e.clientX);
          e.currentTarget.dataset.y = String(e.clientY);
          setRotation((r) => ({ x: r.x + dy * 0.01, y: r.y + dx * 0.01 }));
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      >
        {model.bonds.map(([a, b], i) => (
          <path
            key={i}
            d={`M${atoms[a].x} ${atoms[a].y}L${atoms[b].x} ${atoms[b].y}`}
            stroke="#b9c1d0"
            strokeWidth="10"
            strokeLinecap="round"
          />
        ))}
        {[...atoms]
          .sort((a, b) => b.z - a.z)
          .map((p) => (
            <g key={p.i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={(p.symbol === "H" ? 22 : 30) * p.scale}
                fill={
                  p.symbol === "O"
                    ? "#cd8e94"
                    : p.symbol === "C"
                      ? "#929baa"
                      : "#eef0f7"
                }
                stroke={p.symbol === "H" ? "#c2cadb" : "#ffffff50"}
                strokeWidth="2"
              />
              <ellipse
                cx={p.x - 7 * p.scale}
                cy={p.y - 8 * p.scale}
                rx={9 * p.scale}
                ry={6 * p.scale}
                fill="#ffffff40"
              />
              <text
                x={p.x}
                y={p.y + 5}
                textAnchor="middle"
                fontSize="14"
                fill={p.symbol === "H" ? "#8994aa" : "white"}
              >
                {p.symbol}
              </text>
            </g>
          ))}
      </svg>
      <div className="concept-card">
        <b>{model.note}</b>
        <p>
          模型使用理想化参考几何与三维投影，不是量子计算、能量最小化或真实电子云；键长比例为教学近似。
        </p>
      </div>
    </>
  );
}
export function DnaLab({ state, onChange }: Props) {
  if (state.kind !== "dna") return null;
  const complement = dnaComplement(state.sequence),
    color: Record<string, string> = {
      A: "#a1b0de",
      T: "#e0b28c",
      G: "#94bba9",
      C: "#c89fac",
    };
  return (
    <>
      <LabHeading
        label="DNA EXPLORER"
        title="在配对中，读懂遗传信息。"
        description="编辑序列，实时生成互补链。A 与 T 配对，G 与 C 配对。"
      />
      <label>
        5′ → 3′ 序列
        <input
          aria-label="DNA序列"
          value={state.sequence}
          maxLength={32}
          onChange={(e) => {
            const sequence = e.target.value
              .toUpperCase()
              .replace(/[^ATGC]/g, "");
            if (sequence.length >= 2) onChange({ ...state, sequence });
          }}
        />
      </label>
      <div className="dna-stage">
        {state.sequence.split("").map((base, i) => (
          <div className="base-pair" key={i}>
            <b style={{ background: color[base] }}>{base}</b>
            <span>{base === "A" || base === "T" ? "··" : "···"}</span>
            <b style={{ background: color[complement[i]] }}>{complement[i]}</b>
            <small>{i + 1}</small>
          </div>
        ))}
      </div>
      <div className="concept-card">
        <b>互补链 3′ → 5′：{complement}</b>
        <p>
          GC 比例{" "}
          {(
            (state.sequence.split("").filter((c) => c === "G" || c === "C")
              .length /
              state.sequence.length) *
            100
          ).toFixed(1)}
          %。A–T 两条、G–C
          三条氢键以点示意。本图是碱基配对简化模型，不按真实双螺旋比例。
        </p>
      </div>
    </>
  );
}
