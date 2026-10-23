type Node =
  | { kind: "number"; value: number }
  | { kind: "variable"; name: string }
  | { kind: "unary"; node: Node }
  | { kind: "binary"; op: string; left: Node; right: Node }
  | { kind: "call"; name: string; node: Node };
const functions: Record<string, (n: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
};
/** Bounded expression DSL. No eval, Function, member access, assignments, or user code. */
export function compileExpression(source: string) {
  if (source.length > 256) throw new Error("函数表达式最长 256 个字符");
  const text = source.replace(/\s+/g, "");
  const tokens =
    text.match(
      /(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?|[A-Za-z]+|[()+\-*/^]/g,
    ) ?? [];
  if (tokens.join("") !== text)
    throw new Error("表达式仅支持数字、x/a/b/c、函数与 + − * / ^ ( )");
  let pos = 0,
    nodes = 0;
  function parse(min = 0, depth = 0): Node {
    if (depth > 40 || ++nodes > 128) throw new Error("表达式过于复杂");
    let left: Node,
      t = tokens[pos++];
    if (!t) throw new Error("表达式不完整");
    if (t === "-") left = { kind: "unary", node: parse(25, depth + 1) };
    else if (t === "+") left = parse(25, depth + 1);
    else if (t === "(") {
      left = parse(0, depth + 1);
      if (tokens[pos++] !== ")") throw new Error("括号不匹配");
    } else if (/^(?:\d|\.)/.test(t))
      left = { kind: "number", value: Number(t) };
    else if (["x", "a", "b", "c", "pi", "e"].includes(t))
      left = { kind: "variable", name: t };
    else if (Object.hasOwn(functions, t)) {
      if (tokens[pos++] !== "(") throw new Error("函数参数需要括号");
      left = { kind: "call", name: t, node: parse(0, depth + 1) };
      if (tokens[pos++] !== ")") throw new Error("括号不匹配");
    } else throw new Error("未知名称：" + t);
    while (pos < tokens.length) {
      const op = tokens[pos],
        power =
          op === "+" || op === "-"
            ? 10
            : op === "*" || op === "/"
              ? 20
              : op === "^"
                ? 30
                : 0;
      if (!power || power < min) break;
      pos++;
      left = {
        kind: "binary",
        op,
        left,
        right: parse(power + (op === "^" ? 0 : 1), depth + 1),
      };
    }
    return left;
  }
  const ast = parse();
  if (pos !== tokens.length)
    throw new Error("无法解析表达式；相乘请明确输入 *");
  const calculate = (node: Node, vars: Record<string, number>): number => {
    switch (node.kind) {
      case "number":
        return node.value;
      case "variable":
        return node.name === "pi"
          ? Math.PI
          : node.name === "e"
            ? Math.E
            : (vars[node.name] ?? 0);
      case "unary":
        return -calculate(node.node, vars);
      case "call":
        return functions[node.name](calculate(node.node, vars));
      case "binary": {
        const l = calculate(node.left, vars),
          r = calculate(node.right, vars);
        return node.op === "+"
          ? l + r
          : node.op === "-"
            ? l - r
            : node.op === "*"
              ? l * r
              : node.op === "/"
                ? l / r
                : l ** r;
      }
    }
  };
  return (x: number, a = 1, b = 0, c = 0) => calculate(ast, { x, a, b, c });
}
export function numericRoots(f: (x: number) => number, min = -10, max = 10) {
  const roots: number[] = [];
  const add = (x: number) => {
    if (
      Number.isFinite(x) &&
      !roots.some((r) => Math.abs(r - x) < 1e-4) &&
      Math.abs(f(x)) < 1e-5
    )
      roots.push(x);
  };
  for (let i = 0; i < 1000; i++) {
    let l = min + ((max - min) * i) / 1000,
      r = min + ((max - min) * (i + 1)) / 1000;
    const fl = f(l),
      fr = f(r);
    if (Math.abs(fl) < 1e-8) add(l);
    if (!Number.isFinite(fl) || !Number.isFinite(fr) || fl * fr >= 0) continue;
    for (let n = 0; n < 45; n++) {
      const mid = (l + r) / 2;
      if (f(l) * f(mid) <= 0) r = mid;
      else l = mid;
    }
    add((l + r) / 2);
  }
  return roots;
}
