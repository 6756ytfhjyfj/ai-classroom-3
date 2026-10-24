import { z } from "zod";
export const subjects = [
  {
    id: "math",
    name: "数学",
    en: "MATHEMATICS",
    icon: "ƒ",
    color: "#7381f7",
    topic: "从变化中，发现规律",
    hint: "拖动参数，看看函数图像发生了什么变化。",
  },
  {
    id: "physics",
    name: "物理",
    en: "PHYSICS",
    icon: "Ω",
    color: "#ebac56",
    topic: "把好奇，接入现实",
    hint: "搭建电路，用真实的计算验证你的猜想。",
  },
  {
    id: "chemistry",
    name: "化学",
    en: "CHEMISTRY",
    icon: "⚗",
    color: "#65bfa3",
    topic: "看见微观世界的变化",
    hint: "观察电子得失，理解离子的形成。",
  },
  {
    id: "biology",
    name: "生物",
    en: "BIOLOGY",
    icon: "❋",
    color: "#72b5a1",
    topic: "探索生命的精妙结构",
    hint: "逐层探索细胞，建立你的生命知识图谱。",
  },
  {
    id: "chinese",
    name: "语文",
    en: "LITERATURE",
    icon: "文",
    color: "#ce929a",
    topic: "在文字里，遇见世界",
    hint: "带着问题阅读，梳理文章的结构与表达。",
  },
  {
    id: "english",
    name: "英语",
    en: "ENGLISH",
    icon: "Aa",
    color: "#8f9fd2",
    topic: "让语言，连接更大世界",
    hint: "分析句子，练习表达，让每一次开口都有收获。",
  },
] as const;
export const subjectId = z.enum([
  "math",
  "physics",
  "chemistry",
  "biology",
  "chinese",
  "english",
]);
export type SubjectId = z.infer<typeof subjectId>;
export const usernameSchema = z
  .string()
  .trim()
  .normalize("NFKC")
  .min(2, "用户名至少 2 个字符")
  .max(24)
  .regex(/^[\p{L}\p{N}_·-]+$/u, "仅支持中文、英文、数字、_、·、-");
export const passwordSchema = z.string().min(10, "密码至少 10 个字符").max(128);
export const credentials = z.object({
  username: usernameSchema,
  password: passwordSchema,
});
export const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  p: z.number().min(0).max(1),
  t: z.number().finite(),
});
export const strokeSchema = z.object({
  id: z.string(),
  points: z.array(pointSchema).max(20000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  width: z.number().min(0.1).max(80),
  tool: z.enum(["pen", "pencil", "highlighter"]),
});
export const inkSchema = z.object({
  version: z.literal(1),
  strokes: z.array(strokeSchema).max(5000),
  revision: z.number().int().nonnegative(),
});
export type InkDocument = z.infer<typeof inkSchema>;
export type InkStroke = z.infer<typeof strokeSchema>;
export type InkPoint = z.infer<typeof pointSchema>;
export const emptyInk = (): InkDocument => ({
  version: 1,
  strokes: [],
  revision: 0,
});
export const componentSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum([
    "battery",
    "resistor",
    "bulb",
    "switch",
    "wire",
    "ammeter",
    "voltmeter",
  ]),
  a: z.string().min(1).max(30),
  b: z.string().min(1).max(30),
  value: z.number().finite().min(0).max(1e8),
  closed: z.boolean().default(true),
  x: z.number().finite().default(0),
  y: z.number().finite().default(0),
});
export type CircuitComponent = z.infer<typeof componentSchema>;
export const graphSchema = z.object({
  kind: z.literal("graph"),
  a: z.number().finite().min(-10).max(10),
  b: z.number().finite().min(-20).max(20),
  c: z.number().finite().min(-20).max(20),
  expression: z.string().max(256).default("a*x^2+b*x+c"),
  compare: z.boolean().default(false),
  tangentX: z.number().min(-10).max(10).default(1),
});
export const geometrySchema = z.object({
  kind: z.literal("geometry"),
  points: z
    .array(
      z.object({
        x: z.number().min(-10).max(10),
        y: z.number().min(-10).max(10),
      }),
    )
    .min(3)
    .max(8),
});
export const motionSchema = z.object({
  kind: z.literal("motion"),
  speed: z.number().min(0).max(50),
  angle: z.number().min(0).max(90),
  gravity: z.number().min(0.1).max(30),
  time: z.number().min(0).max(30),
});
export const forcesSchema = z.object({
  kind: z.literal("forces"),
  vectors: z
    .array(
      z.object({
        x: z.number().min(-100).max(100),
        y: z.number().min(-100).max(100),
      }),
    )
    .min(1)
    .max(6),
});
export const opticsSchema = z.object({
  kind: z.literal("optics"),
  focal: z.number().min(1).max(15),
  distance: z.number().min(1).max(40),
  height: z.number().min(0.5).max(5),
});
export const moleculeSchema = z.object({
  kind: z.literal("molecule"),
  formula: z.enum(["H2O", "CO2", "CH4", "O2"]),
});
export const dnaSchema = z.object({
  kind: z.literal("dna"),
  sequence: z.string().regex(/^[ATGC]{2,32}$/),
});
export const circuitSchema = z.object({
  kind: z.literal("circuit"),
  components: z.array(componentSchema).max(50),
});
export const atomSchema = z.object({
  kind: z.literal("atom"),
  element: z.enum(["Na", "Cl", "Mg", "O", "H", "C"]),
  ion: z.boolean(),
});
export const readingSchema = z.object({
  kind: z.literal("reading"),
  text: z.string().max(15000),
  notes: z.string().max(10000).default(""),
});
export const cellSchema = z.object({
  kind: z.literal("cell"),
  selected: z.enum(["membrane", "cytoplasm", "nucleus", "mitochondria"]),
});
export const labSchema = z.discriminatedUnion("kind", [
  graphSchema,
  circuitSchema,
  atomSchema,
  readingSchema,
  cellSchema,
  geometrySchema,
  motionSchema,
  forcesSchema,
  opticsSchema,
  moleculeSchema,
  dnaSchema,
]);
export type LabState = z.infer<typeof labSchema>;
export const initialLab = (s: string): LabState =>
  s === "math"
    ? {
        kind: "graph",
        a: 1,
        b: 0,
        c: 0,
        expression: "a*x^2+b*x+c",
        compare: false,
        tangentX: 1,
      }
    : s === "physics"
      ? {
          kind: "circuit",
          components: [
            {
              id: "V1",
              kind: "battery",
              a: "1",
              b: "0",
              value: 6,
              closed: true,
              x: 100,
              y: 180,
            },
            {
              id: "R1",
              kind: "resistor",
              a: "1",
              b: "0",
              value: 10,
              closed: true,
              x: 350,
              y: 180,
            },
          ],
        }
      : s === "chemistry"
        ? { kind: "atom", element: "Na", ion: false }
        : s === "biology"
          ? { kind: "cell", selected: "nucleus" }
          : { kind: "reading", text: "", notes: "" };
export const labPresets: Record<string, { label: string; state: LabState }[]> =
  {
    math: [
      { label: "函数图像", state: initialLab("math") },
      {
        label: "几何画布",
        state: {
          kind: "geometry",
          points: [
            { x: -3, y: -2 },
            { x: 3, y: -2 },
            { x: 0, y: 3 },
          ],
        },
      },
    ],
    physics: [
      { label: "直流电路", state: initialLab("physics") },
      {
        label: "抛体运动",
        state: { kind: "motion", speed: 15, angle: 45, gravity: 9.8, time: 0 },
      },
      {
        label: "力的合成",
        state: {
          kind: "forces",
          vectors: [
            { x: 3, y: 0 },
            { x: 0, y: 4 },
          ],
        },
      },
      {
        label: "薄透镜成像",
        state: { kind: "optics", focal: 5, distance: 15, height: 2 },
      },
    ],
    chemistry: [
      { label: "原子与离子", state: initialLab("chemistry") },
      { label: "分子结构", state: { kind: "molecule", formula: "H2O" } },
    ],
    biology: [
      { label: "细胞结构", state: initialLab("biology") },
      { label: "DNA 配对", state: { kind: "dna", sequence: "ATGCGTAC" } },
    ],
  };
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  role: string;
  preferences: string;
}
export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  status: string;
  createdAt: string;
  metadata: string;
}
export interface ClassroomSummary {
  id: string;
  subjectId: SubjectId;
  title: string;
  mode: string;
  updatedAt: string;
}
export interface TeachingPlanData {
  goal: string;
  steps: string[];
  currentStep: number;
  completed: number[];
}
export const teachingPlanSchema = z
  .object({
    goal: z.string().min(1).max(200),
    steps: z.array(z.string().min(1).max(300)).min(1).max(12),
    currentStep: z.number().int().min(0).max(11),
    completed: z.array(z.number().int().min(0).max(11)).max(12),
  })
  .refine(
    (p) =>
      p.currentStep < p.steps.length &&
      p.completed.every((n) => n < p.steps.length),
    "步骤索引越界",
  );
export interface ClassroomData extends ClassroomSummary {
  conversation: { messages: ChatMessage[] };
  visualization: { data: string; revision: number };
  handwriting: { data: string; revision: number } | null;
  plans?: { data: string; createdAt: string }[];
}
export type ClassroomState =
  | "IDLE"
  | "TEACHING"
  | "AI_THINKING"
  | "AI_SPEAKING"
  | "AI_INTERRUPTED"
  | "HANDWRITING"
  | "HANDWRITING_RECOGNIZING"
  | "VOICE_LISTENING"
  | "INPUT_REVIEW"
  | "TOOL_EXECUTING"
  | "ERROR_RECOVERY";
export type StreamEvent =
  | { type: "meta"; requestId: string }
  | { type: "text"; delta: string }
  | {
      type: "tool";
      id: string;
      input: unknown;
      output: unknown;
      state: LabState;
      revision: number;
    }
  | { type: "done"; messageId: string }
  | { type: "error"; code: string; message: string };

export type ProviderTestEvent =
  | { type: "progress"; message: string }
  | {
      type: "result";
      model: string;
      elapsedMs: number;
      reply: string;
      apiMode: string;
    }
  | { type: "error"; code: string; message: string };
