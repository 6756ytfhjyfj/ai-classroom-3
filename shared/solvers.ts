import type { CircuitComponent } from "./protocol";

/** Modified nodal analysis. Ideal voltage sources, resistive lamps; no AC model. */
export function solveCircuit(components: CircuitComponent[]): {
  status: "ok" | "open" | "short" | "invalid";
  voltages: Record<string, number>;
  currents: Record<string, number>;
  power: Record<string, number>;
  message: string;
} {
  const live = components.filter(
    (c) => c.kind !== "voltmeter" && (c.kind !== "switch" || c.closed),
  );
  const nodes = [...new Set(live.flatMap((c) => [c.a, c.b]))];
  if (!nodes.length)
    return {
      status: "open" as const,
      voltages: {},
      currents: {},
      power: {},
      message: "没有闭合电路",
    };
  const ground = nodes.includes("0") ? "0" : nodes[0];
  const free = nodes.filter((n) => n !== ground),
    sources = live.filter((c) => c.kind === "battery");
  for (const source of sources) {
    const linked = new Set([source.a]);
    for (let i = 0; i < nodes.length; i++)
      for (const c of live.filter((c) =>
        ["wire", "switch", "ammeter"].includes(c.kind),
      ))
        if (linked.has(c.a) || linked.has(c.b)) {
          linked.add(c.a);
          linked.add(c.b);
        }
    if (linked.has(source.b))
      return {
        status: "short",
        voltages: {},
        currents: {},
        power: {},
        message: "电源两端存在导线短接，请串入限流电阻后重新求解",
      };
  }
  // Connectivity checks prevent silently solving floating components.
  const reached = new Set([ground]);
  for (let i = 0; i < nodes.length; i++)
    for (const c of live)
      if (reached.has(c.a) || reached.has(c.b)) {
        reached.add(c.a);
        reached.add(c.b);
      }
  if (reached.size < nodes.length)
    return {
      status: "open" as const,
      voltages: {},
      currents: {},
      power: {},
      message: "存在浮空节点，请检查导线与开关",
    };
  const size = free.length + sources.length;
  if (size > 80)
    return {
      status: "invalid",
      voltages: {},
      currents: {},
      power: {},
      message: "电路规模超过80个未知量的教学求解限制，请减少元件",
    };
  const A = Array.from(
    { length: size },
    () => Array(size + 1).fill(0) as number[],
  );
  const ni = (n: string) => free.indexOf(n);
  const conduct = (a: string, b: string, g: number) => {
    const i = ni(a),
      j = ni(b);
    if (i >= 0) A[i][i] += g;
    if (j >= 0) A[j][j] += g;
    if (i >= 0 && j >= 0) {
      A[i][j] -= g;
      A[j][i] -= g;
    }
  };
  for (const c of live)
    if (c.kind !== "battery") {
      if ((c.kind === "resistor" || c.kind === "bulb") && c.value <= 0)
        return {
          status: "short" as const,
          voltages: {},
          currents: {},
          power: {},
          message: "电阻必须大于 0 Ω",
        };
      conduct(
        c.a,
        c.b,
        1 / (["wire", "switch", "ammeter"].includes(c.kind) ? 1e-6 : c.value),
      );
    }
  sources.forEach((s, k) => {
    const row = free.length + k,
      a = ni(s.a),
      b = ni(s.b);
    if (a >= 0) {
      A[a][row] = 1;
      A[row][a] = 1;
    }
    if (b >= 0) {
      A[b][row] = -1;
      A[row][b] = -1;
    }
    A[row][size] = s.value;
  });
  for (let col = 0; col < size; col++) {
    let p = col;
    for (let r = col + 1; r < size; r++)
      if (Math.abs(A[r][col]) > Math.abs(A[p][col])) p = r;
    if (Math.abs(A[p][col]) < 1e-12)
      return {
        status: "invalid" as const,
        voltages: {},
        currents: {},
        power: {},
        message: "电路约束矛盾或节点浮空；请检查电源与连线",
      };
    [A[col], A[p]] = [A[p], A[col]];
    const v = A[col][col];
    for (let j = col; j <= size; j++) A[col][j] /= v;
    for (let r = 0; r < size; r++)
      if (r !== col) {
        const f = A[r][col];
        for (let j = col; j <= size; j++) A[r][j] -= f * A[col][j];
      }
  }
  const voltages: Record<string, number> = Object.assign(Object.create(null), {
      [ground]: 0,
    }),
    currents: Record<string, number> = Object.create(null),
    power: Record<string, number> = Object.create(null);
  free.forEach((n, i) => (voltages[n] = A[i][size]));
  for (const c of components) {
    const dv = (voltages[c.a] ?? 0) - (voltages[c.b] ?? 0);
    currents[c.id] =
      c.kind === "battery"
        ? (A[free.length + sources.indexOf(c)]?.[size] ?? 0)
        : c.kind === "voltmeter" || (c.kind === "switch" && !c.closed)
          ? 0
          : dv /
            (["wire", "switch", "ammeter"].includes(c.kind) ? 1e-6 : c.value);
    power[c.id] = dv * currents[c.id];
  }
  const short = sources.some((c) => Math.abs(currents[c.id]) > 1e5);
  return {
    status: short ? ("short" as const) : ("ok" as const),
    voltages,
    currents,
    power,
    message: short
      ? "疑似短路：请串入限流电阻"
      : "直流稳态求解完成（灯泡按固定电阻简化）",
  };
}
export function quadratic(a: number, b: number, c: number) {
  if (a === 0)
    return {
      roots: b === 0 ? [] : [-c / b],
      vertex: null,
      discriminant: null,
      solution: b === 0 ? (c === 0 ? "all-real" : "no-real") : "finite",
    };
  const d = b * b - 4 * a * c;
  return {
    roots:
      d < 0
        ? []
        : d === 0
          ? [-b / (2 * a)]
          : [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)],
    vertex: { x: -b / (2 * a), y: c - (b * b) / (4 * a) },
    discriminant: d,
    solution: d < 0 ? "no-real" : "finite",
  };
}
export const elements = {
  Na: { name: "钠", z: 11, shells: [2, 8, 1], charge: 1 },
  Cl: { name: "氯", z: 17, shells: [2, 8, 7], charge: -1 },
  Mg: { name: "镁", z: 12, shells: [2, 8, 2], charge: 2 },
  O: { name: "氧", z: 8, shells: [2, 6], charge: -2 },
  H: { name: "氢", z: 1, shells: [1], charge: 1 },
  C: { name: "碳", z: 6, shells: [2, 4], charge: 0 },
};
export function atomInfo(element: keyof typeof elements, ion: boolean) {
  const e = elements[element],
    shells = [...e.shells];
  if (ion && e.charge) {
    shells[shells.length - 1] -= e.charge;
    if (shells.at(-1) === 0) shells.pop();
  }
  return {
    ...e,
    element,
    shells,
    charge: ion ? e.charge : 0,
    electrons: e.z - (ion ? e.charge : 0),
    model: "电子层教学示意，不代表真实电子轨道或概率分布",
  };
}

function parseFormula(s: string): Record<string, number> {
  let i = 0;
  function group(nested: boolean): Record<string, number> {
    const result: Record<string, number> = {};
    while (i < s.length && s[i] !== ")") {
      let part: Record<string, number>;
      if (s[i] === "(") {
        i++;
        part = group(true);
        if (s[i++] !== ")") throw new Error("括号不匹配");
      } else {
        const m = /^[A-Z][a-z]?/.exec(s.slice(i));
        if (!m) throw new Error("不支持的化学式");
        i += m[0].length;
        part = { [m[0]]: 1 };
      }
      const m = /^\d+/.exec(s.slice(i)),
        n = m ? Number(m[0]) : 1;
      if (m) i += m[0].length;
      if (n < 1 || n > 999) throw new Error("下标超出范围");
      for (const [k, v] of Object.entries(part))
        result[k] = (result[k] ?? 0) + v * n;
    }
    if (!nested && i !== s.length) throw new Error("括号不匹配");
    return result;
  }
  return group(false);
}
function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : Math.abs(a);
}
export function balanceEquation(equation: string) {
  const sides = equation.replace(/\s/g, "").split(/->|=|→/);
  if (sides.length !== 2) throw new Error("请使用 H2 + O2 -> H2O 格式");
  const l = sides[0].split("+"),
    r = sides[1].split("+"),
    forms = [...l, ...r];
  if (forms.length > 10 || forms.some((f) => !f))
    throw new Error("化合物数量无效");
  const parsed = forms.map(parseFormula),
    els = [...new Set(parsed.flatMap((p) => Object.keys(p)))],
    n = forms.length;
  const mat = els.map((e) =>
    parsed.map((p, j) => (p[e] ?? 0) * (j < l.length ? 1 : -1)),
  );
  let row = 0;
  const pivots: number[] = [];
  for (let c = 0; c < n && row < mat.length; c++) {
    const k = mat.findIndex((a, i) => i >= row && Math.abs(a[c]) > 1e-9);
    if (k < 0) continue;
    [mat[row], mat[k]] = [mat[k], mat[row]];
    const d = mat[row][c];
    mat[row] = mat[row].map((v) => v / d);
    for (let i = 0; i < mat.length; i++)
      if (i !== row) {
        const v = mat[i][c];
        mat[i] = mat[i].map((x, j) => x - v * mat[row][j]);
      }
    pivots.push(c);
    row++;
  }
  const free = Array.from({ length: n }, (_, i) => i).filter(
    (i) => !pivots.includes(i),
  );
  if (free.length !== 1)
    throw new Error("该方程不存在唯一的基本配平，请检查反应物和产物");
  const x = Array(n).fill(0) as number[];
  x[free[0]] = 1;
  for (let k = pivots.length - 1; k >= 0; k--)
    x[pivots[k]] = -mat[k].reduce(
      (s, v, j) => s + (j === pivots[k] ? 0 : v * x[j]),
      0,
    );
  let coeff: number[] | undefined;
  for (let d = 1; d <= 10000; d++) {
    const v = x.map((t) => Math.round(t * d));
    if (
      x.every((t, i) => Math.abs(t * d - v[i]) < 1e-7) &&
      v.every((t) => t > 0)
    ) {
      coeff = v;
      break;
    }
  }
  if (!coeff) throw new Error("无法找到小整数系数");
  const g = coeff.reduce(gcd);
  coeff = coeff.map((v) => v / g);
  if (
    els.some(
      (e) =>
        parsed.reduce(
          (sum, p, j) =>
            sum + (p[e] ?? 0) * coeff![j] * (j < l.length ? 1 : -1),
          0,
        ) !== 0,
    )
  )
    throw new Error("质量守恒验证失败");
  const fmt = (f: string, i: number) => (coeff![i] === 1 ? "" : coeff![i]) + f;
  return {
    coefficients: coeff,
    equation:
      l.map(fmt).join(" + ") +
      " → " +
      r.map((f, i) => fmt(f, i + l.length)).join(" + "),
    verified: true,
  };
}
