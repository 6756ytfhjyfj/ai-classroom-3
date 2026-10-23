export function projectile(
  speed: number,
  angle: number,
  gravity: number,
  time: number,
) {
  const r = (angle * Math.PI) / 180,
    vx = speed * Math.cos(r),
    vy = speed * Math.sin(r),
    flight = (2 * vy) / gravity,
    t = Math.min(time, flight);
  return {
    x: vx * t,
    y: Math.max(0, vy * t - (gravity * t * t) / 2),
    vx,
    vy: vy - gravity * t,
    flight,
    range: vx * flight,
    maxHeight: (vy * vy) / (2 * gravity),
  };
}
export function lens(focal: number, distance: number, height: number) {
  if (Math.abs(distance - focal) < 1e-8)
    return {
      imageDistance: null,
      magnification: null,
      imageHeight: null,
      kind: "焦点处，出射光近似平行，无有限像",
    };
  const imageDistance = 1 / (1 / focal - 1 / distance),
    magnification = -imageDistance / distance;
  return {
    imageDistance,
    magnification,
    imageHeight: height * magnification,
    kind: imageDistance > 0 ? "倒立实像" : "正立虚像",
  };
}
export function geometry(points: { x: number; y: number }[]) {
  const area =
      Math.abs(
        points.reduce((s, p, i) => {
          const q = points[(i + 1) % points.length];
          return s + p.x * q.y - q.x * p.y;
        }, 0),
      ) / 2,
    edges = points.map((p, i) => {
      const q = points[(i + 1) % points.length];
      return Math.hypot(q.x - p.x, q.y - p.y);
    });
  return {
    area,
    perimeter: edges.reduce((s, v) => s + v, 0),
    edges,
    model: "按顶点顺序的简单多边形；自相交形状不适用普通面积解释",
  };
}
export const dnaComplement = (s: string) =>
  s
    .split("")
    .map((c) => ({ A: "T", T: "A", G: "C", C: "G" })[c])
    .join("");
