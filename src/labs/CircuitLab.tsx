import { useState } from "react";
import { Trash2, Plus, MousePointer2, Link2 } from "lucide-react";
import type { CircuitComponent, LabState } from "../../shared/protocol";
import { solveCircuit } from "../../shared/solvers";
type Circuit = Extract<LabState, { kind: "circuit" }>;
const labels = {
  battery: "电池",
  resistor: "电阻",
  bulb: "灯泡",
  switch: "开关",
  wire: "导线",
  ammeter: "电流表",
  voltmeter: "电压表",
};
export function CircuitLab({
  state,
  onChange,
}: {
  state: Circuit;
  onChange: (s: LabState) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [port, setPort] = useState<{ id: string; end: "a" | "b" } | null>(null);
  const result = solveCircuit(state.components),
    current = state.components.find((c) => c.id === selected);
  const update = (id: string, change: Partial<CircuitComponent>) =>
    onChange({
      ...state,
      components: state.components.map((c) =>
        c.id === id ? { ...c, ...change } : c,
      ),
    });
  const connect = (id: string, end: "a" | "b") => {
    if (!port) {
      setPort({ id, end });
      return;
    }
    const from = state.components.find((c) => c.id === port.id)!;
    const to = state.components.find((c) => c.id === id)!;
    const old = to[end],
      node = from[port.end];
    onChange({
      ...state,
      components: state.components.map((c) => ({
        ...c,
        a: c.a === old ? node : c.a,
        b: c.b === old ? node : c.b,
      })),
    });
    setPort(null);
  };
  const endpoints = state.components.flatMap((c) => [
    { node: c.a, x: c.x - 50, y: c.y },
    { node: c.b, x: c.x + 50, y: c.y },
  ]);
  const groups = [...new Set(endpoints.map((p) => p.node))];
  return (
    <div className="circuit-lab">
      <div className="lab-title-row">
        <div>
          <span className="eyebrow">CIRCUIT STUDIO</span>
          <h2>把想法，连成电路。</h2>
          <p>拖动元件，点击两个接线端连接；相同节点电气相连。</p>
        </div>
        <span className="pill">DC · 直流稳态</span>
      </div>
      <div className="circuit-tools">
        {Object.entries(labels).map(([kind, name]) => (
          <button
            key={kind}
            onClick={() => {
              const id =
                kind[0].toUpperCase() + crypto.randomUUID().slice(0, 4);
              onChange({
                ...state,
                components: [
                  ...state.components,
                  {
                    id,
                    kind: kind as CircuitComponent["kind"],
                    a: "n" + id + "a",
                    b: "n" + id + "b",
                    value:
                      kind === "battery"
                        ? 6
                        : kind === "resistor" || kind === "bulb"
                          ? 10
                          : 0,
                    closed: true,
                    x: 140 + (state.components.length % 4) * 170,
                    y: 100 + Math.floor(state.components.length / 4) * 100,
                  },
                ],
              });
              setSelected(id);
            }}
          >
            <Plus size={13} />
            {name}
          </button>
        ))}
      </div>
      <div className="circuit-workspace">
        <svg
          viewBox="0 0 900 420"
          className="circuit-svg"
          aria-label="可交互直流电路"
        >
          <defs>
            <pattern
              id="circuit-dots"
              width="22"
              height="22"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="2" r="1" fill="var(--grid)" />
            </pattern>
          </defs>
          <rect
            width="900"
            height="420"
            fill="url(#circuit-dots)"
            onPointerDown={() => {
              setSelected(null);
              setPort(null);
            }}
          />
          {groups.map((node, k) => {
            const ps = endpoints.filter((p) => p.node === node);
            return ps
              .slice(1)
              .map((p, i) => (
                <path
                  key={node + i}
                  d={`M${ps[0].x},${ps[0].y} V${Math.min(ps[0].y, p.y) - 55 - (k % 3) * 15} H${p.x} V${p.y}`}
                  fill="none"
                  stroke="var(--axis)"
                  strokeWidth="2"
                />
              ));
          })}
          {state.components.map((c) => (
            <g key={c.id} transform={`translate(${c.x} ${c.y})`}>
              <rect
                x="-62"
                y="-40"
                width="124"
                height="80"
                rx="12"
                fill={
                  selected === c.id ? "var(--accent-soft)" : "var(--surface)"
                }
                stroke={selected === c.id ? "var(--accent)" : "var(--border)"}
                className="component-drag"
                onPointerDown={(e) => {
                  setSelected(c.id);
                  e.currentTarget.setPointerCapture(e.pointerId);
                  e.currentTarget.dataset.dragX = String(e.clientX);
                  e.currentTarget.dataset.dragY = String(e.clientY);
                  e.currentTarget.dataset.startX = String(c.x);
                  e.currentTarget.dataset.startY = String(c.y);
                }}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                  const box =
                      e.currentTarget.ownerSVGElement!.getBoundingClientRect(),
                    ratio = 900 / box.width;
                  update(c.id, {
                    x: Math.max(
                      65,
                      Math.min(
                        835,
                        Number(e.currentTarget.dataset.startX) +
                          (e.clientX - Number(e.currentTarget.dataset.dragX)) *
                            ratio,
                      ),
                    ),
                    y: Math.max(
                      55,
                      Math.min(
                        365,
                        Number(e.currentTarget.dataset.startY) +
                          (e.clientY - Number(e.currentTarget.dataset.dragY)) *
                            ratio,
                      ),
                    ),
                  });
                }}
                onPointerUp={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId))
                    e.currentTarget.releasePointerCapture(e.pointerId);
                }}
              />
              <g
                pointerEvents="none"
                stroke="var(--text)"
                strokeWidth="2"
                fill="none"
              >
                <path d="M-50 0H-30 M30 0H50" />
                {c.kind === "battery" ? (
                  <>
                    <path d="M-9 -20V20 M8 -12V12 M-30 0H-9 M8 0H30" />
                    <text
                      x="-24"
                      y="-17"
                      fontSize="12"
                      stroke="none"
                      fill="var(--accent)"
                    >
                      +
                    </text>
                  </>
                ) : c.kind === "resistor" ? (
                  <path d="M-30 0 L-24 -8 -16 8 -8 -8 0 8 8 -8 16 8 24 -8 30 0" />
                ) : c.kind === "bulb" ? (
                  <>
                    <circle r="22" />
                    <path d="M-15 -15L15 15 M-15 15L15 -15" />
                  </>
                ) : c.kind === "switch" ? (
                  <>
                    <path d={c.closed ? "M-30 0H30" : "M-30 0L24 -22"} />
                    <circle cx="-30" r="3" />
                    <circle cx="30" r="3" />
                  </>
                ) : c.kind === "wire" ? (
                  <path d="M-30 0H30" />
                ) : (
                  <>
                    <circle r="22" />
                    <text
                      y="7"
                      textAnchor="middle"
                      fontSize="20"
                      fill="var(--text)"
                      stroke="none"
                    >
                      {c.kind === "ammeter" ? "A" : "V"}
                    </text>
                  </>
                )}
              </g>
              <text y="-53" textAnchor="middle" className="circuit-label">
                {c.id} · {labels[c.kind]}
              </text>
              <text y="59" textAnchor="middle" className="circuit-value">
                {c.kind === "battery"
                  ? c.value + " V"
                  : c.kind === "resistor" || c.kind === "bulb"
                    ? c.value + " Ω"
                    : result.status !== "ok"
                      ? "—"
                      : c.kind === "voltmeter"
                        ? (
                            (result.voltages[c.a] ?? 0) -
                            (result.voltages[c.b] ?? 0)
                          ).toFixed(3) + " V"
                        : (result.currents[c.id] ?? 0).toFixed(3) + " A"}
              </text>
              {(["a", "b"] as const).map((end) => (
                <g
                  key={end}
                  onClick={() => connect(c.id, end)}
                  className="port"
                >
                  <circle
                    cx={end === "a" ? -50 : 50}
                    r="7"
                    fill={
                      port?.id === c.id && port.end === end
                        ? "var(--accent)"
                        : "var(--surface)"
                    }
                    stroke="var(--accent)"
                    strokeWidth="2"
                  />
                  <text
                    x={end === "a" ? -50 : 50}
                    y="24"
                    textAnchor="middle"
                    className="node-label"
                  >
                    {c[end]}
                  </text>
                </g>
              ))}
            </g>
          ))}
        </svg>
        {current && (
          <aside className="component-properties">
            <b>
              {labels[current.kind]} · {current.id}
            </b>
            <label>
              参数 ({current.kind === "battery" ? "V" : "Ω"})
              <input
                type="number"
                min="0"
                max="100000000"
                value={current.value}
                onChange={(e) =>
                  update(current.id, {
                    value: Math.max(0, Number(e.target.value)),
                  })
                }
              />
            </label>
            <label>
              端点 a
              <input
                value={current.a}
                maxLength={30}
                onChange={(e) =>
                  update(current.id, { a: e.target.value || "0" })
                }
              />
            </label>
            <label>
              端点 b
              <input
                value={current.b}
                maxLength={30}
                onChange={(e) =>
                  update(current.id, { b: e.target.value || "0" })
                }
              />
            </label>
            {current.kind === "switch" && (
              <button
                className="secondary"
                onClick={() => update(current.id, { closed: !current.closed })}
              >
                {current.closed ? "断开开关" : "闭合开关"}
              </button>
            )}
            <button
              className="danger text-button"
              onClick={() => {
                onChange({
                  ...state,
                  components: state.components.filter(
                    (c) => c.id !== current.id,
                  ),
                });
                setSelected(null);
              }}
            >
              <Trash2 size={14} />
              删除元件
            </button>
          </aside>
        )}
      </div>
      <div
        className={
          "calculation-status " + (result.status === "ok" ? "" : "warning")
        }
      >
        <span className="status-dot" />
        {result.message}
      </div>
      <div className="circuit-readings">
        {state.components
          .filter(
            (c) =>
              c.kind === "resistor" ||
              c.kind === "bulb" ||
              c.kind === "battery",
          )
          .map((c) => (
            <div key={c.id}>
              <span>{c.id} 电流</span>
              <strong>
                {result.status === "ok"
                  ? (result.currents[c.id] ?? 0).toFixed(3)
                  : "—"}{" "}
                <small>A</small>
              </strong>
            </div>
          ))}
      </div>
      <p className="lab-footnote">
        <MousePointer2 size={13} />
        拖动元件 <span>·</span>
        <Link2 size={13} />
        {port ? "选择另一个端点完成连接" : "点击端点接线"} <span>·</span>
        导线/闭合开关以 1 µΩ 近似；灯泡按固定电阻；电压表为理想开路。
      </p>
    </div>
  );
}
