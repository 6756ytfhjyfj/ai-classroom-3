import {
  emptyInk,
  type InkDocument,
  type InkPoint,
  type InkStroke,
} from "../../shared/protocol";
export type InkTool = "pen" | "pencil" | "highlighter" | "eraser" | "pan";
type Snapshot = InkStroke[];
export class InkEngine {
  document: InkDocument = emptyInk();
  tool: InkTool = "pen";
  color = "#263342";
  width = 3;
  viewport = { x: 0, y: 0, scale: 1 };
  private ctx: CanvasRenderingContext2D;
  private cache = document.createElement("canvas");
  private cacheCtx: CanvasRenderingContext2D;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private active: InkStroke | null = null;
  private pointer: number | null = null;
  private pen = false;
  private moving = false;
  private last = { x: 0, y: 0 };
  private frame = 0;
  private observer: ResizeObserver;
  private dprQuery: MediaQueryList = window.matchMedia(
    `(resolution: ${window.devicePixelRatio}dppx)`,
  );
  private onDprChange = () => {
    this.dprQuery.removeEventListener("change", this.onDprChange);
    this.dprQuery = window.matchMedia(
      `(resolution: ${window.devicePixelRatio}dppx)`,
    );
    this.dprQuery.addEventListener("change", this.onDprChange);
    this.resize();
  };
  private dirty = true;
  private lastDraft = 0;
  private disposed = false;
  onChange: (doc: InkDocument) => void = () => {};
  onProgress: (doc: InkDocument) => void = () => {};
  stats = { points: 0, frames: 0, renderMs: 0, maxRenderMs: 0 };
  constructor(
    private canvas: HTMLCanvasElement,
    initial: InkDocument = emptyInk(),
  ) {
    this.ctx = canvas.getContext("2d", { desynchronized: true })!;
    this.cacheCtx = this.cache.getContext("2d")!;
    this.document = structuredClone(initial);
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.down);
    canvas.addEventListener("pointermove", this.move);
    canvas.addEventListener("pointerup", this.up);
    canvas.addEventListener("pointercancel", this.cancel);
    canvas.addEventListener("lostpointercapture", this.cancel);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    canvas.addEventListener("contextmenu", this.prevent);
    window.addEventListener("blur", this.finish);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.dprQuery.addEventListener("change", this.onDprChange);
    this.resize();
  }
  private prevent = (e: Event) => e.preventDefault();
  private resize() {
    if (this.disposed) return;
    const r = this.canvas.getBoundingClientRect(),
      dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.cache.width = this.canvas.width;
    this.cache.height = this.canvas.height;
    this.dirty = true;
    this.request();
  }
  private point(e: PointerEvent): InkPoint {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - this.viewport.x) / this.viewport.scale,
      y: (e.clientY - r.top - this.viewport.y) / this.viewport.scale,
      p: e.pointerType === "pen" ? Math.max(0.05, e.pressure) : 0.5,
      t: e.timeStamp,
    };
  }
  private checkpoint() {
    this.undoStack.push(this.document.strokes.slice());
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
  }
  private down = (e: PointerEvent) => {
    if (this.pointer !== null) return;
    if (e.pointerType === "touch" && this.pen) return;
    e.preventDefault();
    this.pointer = e.pointerId;
    this.pen = e.pointerType === "pen";
    this.canvas.setPointerCapture(e.pointerId);
    this.last = { x: e.clientX, y: e.clientY };
    this.moving =
      this.tool === "pan" ||
      e.button === 1 ||
      e.button === 2 ||
      e.pointerType === "touch";
    if (this.moving) return;
    this.checkpoint();
    if (this.tool === "eraser" || e.button === 5 || e.buttons === 32) {
      this.erase(this.point(e));
      return;
    }
    this.active = {
      id: crypto.randomUUID(),
      points: [this.point(e)],
      color: this.color,
      width: this.width,
      tool: this.tool as InkStroke["tool"],
    };
    this.request();
  };
  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointer) return;
    e.preventDefault();
    if (this.moving) {
      this.viewport.x += e.clientX - this.last.x;
      this.viewport.y += e.clientY - this.last.y;
      this.last = { x: e.clientX, y: e.clientY };
      this.dirty = true;
      this.request();
      return;
    }
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const event of events.length ? events : [e]) {
      const p = this.point(event);
      if (this.active) {
        const old = this.active.points.at(-1)!;
        if (Math.hypot(p.x - old.x, p.y - old.y) > 0.1) {
          this.active.points.push(p);
          this.stats.points++;
        }
      } else this.erase(p);
    }
    if (this.active && performance.now() - this.lastDraft > 800) {
      this.lastDraft = performance.now();
      this.onProgress(this.snapshot());
    }
    this.request();
  };
  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointer) return;
    if (this.active) this.active.points.push(this.point(e));
    this.finish();
  };
  private cancel = (e: PointerEvent) => {
    if (e.pointerId === this.pointer) this.finish();
  };
  finish = () => {
    if (this.pointer === null) return;
    const id = this.pointer;
    this.pointer = null;
    if (this.active) {
      this.document.strokes = [...this.document.strokes, this.active];
      this.active = null;
      this.dirty = true;
    }
    this.pen = false;
    if (this.canvas.hasPointerCapture(id))
      this.canvas.releasePointerCapture(id);
    if (!this.moving) {
      this.document.revision++;
      this.onChange(this.snapshot());
    }
    this.moving = false;
    this.request();
  };
  private erase(p: InkPoint) {
    const radius = 14 / this.viewport.scale;
    const remaining = this.document.strokes.filter(
      (s) =>
        !s.points.some((v, i) => {
          if (Math.hypot(v.x - p.x, v.y - p.y) < radius + s.width) return true;
          if (!i) return false;
          const a = s.points[i - 1],
            dx = v.x - a.x,
            dy = v.y - a.y,
            l = dx * dx + dy * dy,
            k = l
              ? Math.max(
                  0,
                  Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l),
                )
              : 0;
          return (
            Math.hypot(a.x + k * dx - p.x, a.y + k * dy - p.y) <
            radius + s.width
          );
        }),
    );
    if (remaining.length !== this.document.strokes.length) {
      this.document.strokes = remaining;
      this.dirty = true;
      this.request();
    }
  }
  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    this.zoom(
      Math.exp(-e.deltaY * 0.001),
      e.clientX - r.left,
      e.clientY - r.top,
    );
  };
  zoom(
    factor: number,
    x = this.canvas.clientWidth / 2,
    y = this.canvas.clientHeight / 2,
  ) {
    const old = this.viewport.scale,
      next = Math.max(0.2, Math.min(5, old * factor));
    this.viewport.x = x - ((x - this.viewport.x) * next) / old;
    this.viewport.y = y - ((y - this.viewport.y) * next) / old;
    this.viewport.scale = next;
    this.dirty = true;
    this.request();
  }
  resetView() {
    this.viewport = { x: 0, y: 0, scale: 1 };
    this.dirty = true;
    this.request();
  }
  undo() {
    this.finish();
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(this.document.strokes.slice());
    this.document.strokes = s;
    this.changed();
  }
  redo() {
    this.finish();
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(this.document.strokes.slice());
    this.document.strokes = s;
    this.changed();
  }
  clear() {
    this.finish();
    if (!this.document.strokes.length) return;
    this.checkpoint();
    this.document.strokes = [];
    this.changed();
  }
  private changed() {
    this.document.revision++;
    this.dirty = true;
    this.onChange(this.snapshot());
    this.request();
  }
  snapshot(): InkDocument {
    return {
      version: 1,
      revision: this.document.revision + (this.active ? 1 : 0),
      strokes: structuredClone(
        this.active
          ? [...this.document.strokes, this.active]
          : this.document.strokes,
      ),
    };
  }
  private setup(ctx: CanvasRenderingContext2D) {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(this.viewport.x, this.viewport.y);
    ctx.scale(this.viewport.scale, this.viewport.scale);
  }
  private drawStroke(ctx: CanvasRenderingContext2D, s: InkStroke) {
    const pts = s.points;
    if (!pts.length) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.globalAlpha =
      s.tool === "highlighter" ? 0.25 : s.tool === "pencil" ? 0.78 : 1;
    const factor = s.tool === "highlighter" ? 5 : 1;
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(
        pts[0].x,
        pts[0].y,
        (s.width * (0.4 + pts[0].p) * factor) / 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1],
          b = pts[i],
          prev = pts[Math.max(0, i - 2)];
        ctx.lineWidth = s.width * (0.35 + (a.p + b.p) / 2) * factor;
        ctx.beginPath();
        ctx.moveTo(
          i === 1 ? a.x : (prev.x + a.x) / 2,
          i === 1 ? a.y : (prev.y + a.y) / 2,
        );
        ctx.quadraticCurveTo(
          a.x,
          a.y,
          i === pts.length - 1 ? b.x : (a.x + b.x) / 2,
          i === pts.length - 1 ? b.y : (a.y + b.y) / 2,
        );
        ctx.stroke();
      }
    ctx.restore();
  }
  private request() {
    if (!this.frame && !this.disposed)
      this.frame = requestAnimationFrame(() => this.render());
  }
  private render() {
    this.frame = 0;
    const start = performance.now();
    if (this.dirty) {
      this.cacheCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.cacheCtx.clearRect(0, 0, this.cache.width, this.cache.height);
      this.setup(this.cacheCtx);
      for (const s of this.document.strokes) this.drawStroke(this.cacheCtx, s);
      this.dirty = false;
    }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.cache, 0, 0);
    this.setup(this.ctx);
    if (this.active) this.drawStroke(this.ctx, this.active);
    const elapsed = performance.now() - start;
    this.stats.frames++;
    this.stats.renderMs += elapsed;
    this.stats.maxRenderMs = Math.max(this.stats.maxRenderMs, elapsed);
  }
  exportPNG() {
    this.finish();
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const s of this.document.strokes)
      for (const p of s.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    if (!Number.isFinite(minX)) throw new Error("先写下你的问题");
    const w = Math.max(300, maxX - minX + 60),
      h = Math.max(180, maxY - minY + 60),
      scale = Math.min(2, 2000 / Math.max(w, h));
    const out = document.createElement("canvas");
    out.width = Math.ceil(w * scale);
    out.height = Math.ceil(h * scale);
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.scale(scale, scale);
    ctx.translate(30 - minX, 30 - minY);
    for (const s of this.document.strokes) this.drawStroke(ctx, s);
    return out.toDataURL("image/png");
  }
  dispose() {
    this.finish();
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.dprQuery.removeEventListener("change", this.onDprChange);
    this.canvas.removeEventListener("pointerdown", this.down);
    this.canvas.removeEventListener("pointermove", this.move);
    this.canvas.removeEventListener("pointerup", this.up);
    this.canvas.removeEventListener("pointercancel", this.cancel);
    this.canvas.removeEventListener("lostpointercapture", this.cancel);
    this.canvas.removeEventListener("wheel", this.wheel);
    this.canvas.removeEventListener("contextmenu", this.prevent);
    window.removeEventListener("blur", this.finish);
  }
}
