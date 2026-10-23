import { useMemo, useState } from "react";
import { Crosshair, RotateCcw, Plus, Minus } from "lucide-react";
import { quadratic } from "../../shared/solvers";
import { compileExpression, numericRoots } from "../../shared/expressions";
import type { LabState } from "../../shared/protocol";
import { IconButton, ErrorNotice } from "../components/ui";
type Graph = Extract<LabState, { kind: "graph" }>;
export function GraphLab({
  state,
  onChange,
}: {
  state: Graph;
  onChange: (s: LabState) => void;
}) {
  const [zoom, setZoom] = useState(1),
    [tangent, setTangent] = useState(false);
  const { a, b, c } = state,
    W = 900,
    H = 530,
    scale = 40 * zoom,
    origin = { x: W / 2, y: H / 2 };
  const project = (x: number, y: number) =>
    `${origin.x + x * scale},${origin.y - y * scale}`;
  const expression = state.expression ?? "a*x^2+b*x+c",
    isQuadratic = expression === "a*x^2+b*x+c";
  const compiled = useMemo(() => {
    try {
      return { f: compileExpression(expression), error: "" };
    } catch (e) {
      return {
        f: () => NaN,
        error: e instanceof Error ? e.message : "表达式错误",
      };
    }
  }, [expression]);
  const f = (x: number) => compiled.f(x, a, b, c);
  const path = useMemo(() => {
    let pen = false;
    return Array.from({ length: 901 }, (_, i) => {
      const x = ((i / 900) * W - W / 2) / scale,
        y = f(x);
      if (!Number.isFinite(y) || Math.abs(y) > (H / scale) * 2) {
        pen = false;
        return "";
      }
      const value = `${pen ? "L" : "M"}${project(x, y)}`;
      pen = true;
      return value;
    }).join(" ");
  }, [a, b, c, scale, compiled]);
  const result = isQuadratic
      ? quadratic(a, b, c)
      : { roots: numericRoots(f), vertex: null },
    tx = state.tangentX,
    ty = f(tx),
    slope = (f(tx + 1e-5) - f(tx - 1e-5)) / 2e-5;
  const fmt = (n: number) => Number(n.toFixed(3));
  return (
    <div className="graph-lab">
      <div className="lab-title-row">
        <div>
          <span className="eyebrow">FUNCTION EXPLORER</span>
          <h2>让函数，变得直观。</h2>
          <p>拖动滑块，观察参数如何改变图像。</p>
        </div>
        <div className="equation-chip">
          {isQuadratic ? (
            <>
              y = <span>{a}</span>x² {b < 0 ? "−" : "+"} {Math.abs(b)}x{" "}
              {c < 0 ? "−" : "+"} {Math.abs(c)}
            </>
          ) : (
            <>y = {expression}</>
          )}
        </div>
      </div>
      <div className="function-expression">
        <span>f(x) =</span>
        <input
          aria-label="函数表达式"
          value={expression}
          maxLength={256}
          onChange={(e) => onChange({ ...state, expression: e.target.value })}
        />
        <small>支持 sin(x)、sqrt(x)、a*x^2；相乘使用 *</small>
      </div>
      <ErrorNotice message={compiled.error} />
      <div className="graph-stage">
        <div className="graph-legend">
          <span className="legend-dot" />
          f(x) = {expression}{" "}
          {state.compare && <span className="muted">&nbsp; · 基准 y = x²</span>}
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`函数图像 y=${expression}`}
        >
          <defs>
            <pattern
              id="minor-grid"
              width={scale}
              height={scale}
              patternUnits="userSpaceOnUse"
              x={origin.x % scale}
              y={origin.y % scale}
            >
              <path
                d={`M ${scale} 0 L 0 0 0 ${scale}`}
                fill="none"
                stroke="var(--grid)"
                strokeWidth="1"
              />
            </pattern>
            <clipPath id="graph-clip">
              <rect width={W} height={H} />
            </clipPath>
          </defs>
          <rect width={W} height={H} fill="url(#minor-grid)" />
          <path
            d={`M 18 ${origin.y} H ${W - 20} M ${origin.x} ${H - 18} V 20`}
            stroke="var(--axis)"
            strokeWidth="1.3"
          />
          <path
            d={`M ${W - 26} ${origin.y - 4} L ${W - 20} ${origin.y} ${W - 26} ${origin.y + 4} M ${origin.x - 4} 26 L ${origin.x} 20 ${origin.x + 4} 26`}
            fill="none"
            stroke="var(--axis)"
          />
          {Array.from({ length: 21 }, (_, i) => i - 10)
            .filter((n) => n !== 0 && Math.abs(n * scale) < W / 2 - 30)
            .map((n) => (
              <g key={n}>
                <text
                  x={origin.x + n * scale}
                  y={origin.y + 22}
                  textAnchor="middle"
                  fill="var(--muted)"
                  fontSize="12"
                >
                  {n}
                </text>
                {Math.abs(n * scale) < H / 2 - 30 && (
                  <text
                    x={origin.x - 13}
                    y={origin.y - n * scale + 4}
                    textAnchor="end"
                    fill="var(--muted)"
                    fontSize="12"
                  >
                    {n}
                  </text>
                )}
              </g>
            ))}
          <text
            x={origin.x - 17}
            y={origin.y + 22}
            fill="var(--muted)"
            fontSize="12"
          >
            O
          </text>
          <text
            x={W - 20}
            y={origin.y + 23}
            fill="var(--muted)"
            fontStyle="italic"
          >
            x
          </text>
          <text x={origin.x + 17} y={24} fill="var(--muted)" fontStyle="italic">
            y
          </text>
          <g clipPath="url(#graph-clip)">
            {state.compare && (
              <path
                d={Array.from({ length: 401 }, (_, i) => {
                  const x = ((i / 400) * W - W / 2) / scale;
                  return `${i ? "L" : "M"}${project(x, x * x)}`;
                }).join(" ")}
                fill="none"
                stroke="#b6bfd1"
                strokeDasharray="6 7"
                strokeWidth="2"
              />
            )}
            <path
              d={path}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            {tangent && (
              <>
                <path
                  d={`M${project(-20, ty + slope * (-20 - tx))} L${project(20, ty + slope * (20 - tx))}`}
                  stroke="#dca75e"
                  strokeWidth="2"
                  strokeDasharray="7 5"
                />
                <circle
                  cx={origin.x + tx * scale}
                  cy={origin.y - ty * scale}
                  r="5"
                  fill="#dca75e"
                />
              </>
            )}
            {result.roots.map((r, i) => (
              <circle
                key={i}
                cx={origin.x + r * scale}
                cy={origin.y}
                r="5"
                fill="var(--accent)"
                stroke="var(--surface)"
                strokeWidth="2"
              />
            ))}
            {result.vertex && (
              <circle
                cx={origin.x + result.vertex.x * scale}
                cy={origin.y - result.vertex.y * scale}
                r="5"
                fill="var(--accent)"
                stroke="var(--surface)"
                strokeWidth="2"
              />
            )}
          </g>
        </svg>
        <div className="graph-zoom">
          <IconButton
            label="放大图像"
            onClick={() => setZoom((v) => Math.min(2.5, v * 1.2))}
          >
            <Plus size={16} />
          </IconButton>
          <span>{Math.round(zoom * 100)}%</span>
          <IconButton
            label="缩小图像"
            onClick={() => setZoom((v) => Math.max(0.4, v / 1.2))}
          >
            <Minus size={16} />
          </IconButton>
          <IconButton label="重置视图" onClick={() => setZoom(1)}>
            <Crosshair size={16} />
          </IconButton>
        </div>
        <div className="graph-coordinate">
          {result.vertex
            ? `顶点 (${fmt(result.vertex.x)}, ${fmt(result.vertex.y)})`
            : "一次函数"}{" "}
          <span>·</span> 实根{" "}
          {isQuadratic && a === 0 && b === 0 && c === 0
            ? "所有实数"
            : result.roots.length
              ? result.roots.map(fmt).join("，")
              : isQuadratic
                ? "无"
                : "[-10,10]未检出（数值搜索）"}
        </div>
      </div>
      <div className="parameter-panel">
        <div className="parameter-heading">
          <span>
            探索参数 <small>拖动，发现变化</small>
          </span>
          <button
            className="text-button"
            onClick={() => onChange({ ...state, a: 1, b: 0, c: 0 })}
          >
            <RotateCcw size={13} />
            重置
          </button>
        </div>
        <div className="parameter-sliders">
          {(["a", "b", "c"] as const).map((key) => (
            <label className="slider-control" key={key}>
              <span>
                <i>{key}</i>
                <strong>{state[key].toFixed(1)}</strong>
              </span>
              <input
                aria-label={`参数 ${key}`}
                type="range"
                min={key === "a" ? -5 : -10}
                max={key === "a" ? 5 : 10}
                step=".1"
                value={state[key]}
                onChange={(e) =>
                  onChange({ ...state, [key]: Number(e.target.value) })
                }
              />
              <small>
                {key === "a"
                  ? "开口方向与宽度"
                  : key === "b"
                    ? "对称轴的位置"
                    : "与 y 轴的交点"}
              </small>
            </label>
          ))}
        </div>
        <div className="parameter-options">
          <label className="check">
            <input
              type="checkbox"
              checked={state.compare}
              onChange={(e) =>
                onChange({ ...state, compare: e.target.checked })
              }
            />
            与 y = x² 对比
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={tangent}
              onChange={(e) => setTangent(e.target.checked)}
            />
            显示导数切线
          </label>
          {tangent && (
            <label className="inline-label">
              切点 x
              <input
                type="number"
                min="-10"
                max="10"
                step=".1"
                value={tx}
                onChange={(e) =>
                  onChange({
                    ...state,
                    tangentX: Math.max(
                      -10,
                      Math.min(10, Number(e.target.value)),
                    ),
                  })
                }
              />
              <small>斜率 {fmt(slope)}</small>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
