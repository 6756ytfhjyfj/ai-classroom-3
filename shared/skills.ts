import { z } from "zod";
import {
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
  teachingPlanSchema,
  labSchema,
  type LabState,
  type SubjectId,
} from "./protocol.js";
import { solveCircuit, quadratic, atomInfo, balanceEquation } from "./solvers.js";
import { compileExpression, numericRoots } from "./expressions.js";
import { geometry, projectile, lens, dnaComplement } from "./science.js";
export interface TeachingSkill {
  id: string;
  name: string;
  subject: SubjectId | "all";
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  permissions: string[];
  version: string;
  visualRenderer: string;
  execute: (input: unknown) => { result: unknown; state?: LabState };
  errorHandler: (e: unknown) => string;
}
const make = (
  s: Omit<
    TeachingSkill,
    "permissions" | "version" | "errorHandler" | "outputSchema"
  >,
): TeachingSkill => ({
  ...s,
  permissions: ["classroom:write"],
  version: "1.0.0",
  outputSchema: z.object({
    result: z.json(),
    state: labSchema.optional(),
  }),
  errorHandler: (e) => (e instanceof Error ? e.message : "工具执行失败"),
});
export const skillRegistry: TeachingSkill[] = [
  make({
    id: "TeachingPlan",
    name: "教学计划与进度",
    subject: "all",
    description:
      "在主动教学中创建或更新简短课程计划及进度。goal学习目标，steps教学步骤，currentStep当前步骤从0开始，completed已理解的步骤索引。只有学生确认理解后标记完成。",
    inputSchema: teachingPlanSchema,
    visualRenderer: "plan",
    execute: (i) => ({ result: teachingPlanSchema.parse(i) }),
  }),
  make({
    id: "FunctionGraph",
    name: "函数实验室",
    subject: "math",
    description:
      "创建函数、对比基准y=x²、参数平移放缩。expression支持x,a,b,c和sin/cos/tan/sqrt/abs/exp/ln/log,+-*/^；默认a*x^2+b*x+c。返回真实计算，禁止脚本。",
    inputSchema: graphSchema.omit({ kind: true }),
    visualRenderer: "graph",
    execute: (i) => {
      const state = graphSchema.parse({ kind: "graph", ...(i as object) }),
        f = compileExpression(state.expression);
      return {
        state,
        result:
          state.expression === "a*x^2+b*x+c"
            ? quadratic(state.a, state.b, state.c)
            : {
                roots: numericRoots((x) => f(x, state.a, state.b, state.c)),
                interval: [-10, 10],
                note: "数值变号搜索可能遗漏偶重根；不代表区间外无根",
              },
      };
    },
  }),
  make({
    id: "EquationSolver",
    name: "二次方程求解",
    subject: "math",
    description: "计算 ax²+bx+c=0 的实根，独立于画布。",
    inputSchema: z.object({
      a: z.number().finite(),
      b: z.number().finite(),
      c: z.number().finite(),
    }),
    visualRenderer: "result",
    execute: (i) => {
      const { a, b, c } = i as { a: number; b: number; c: number };
      return { result: quadratic(a, b, c) };
    },
  }),
  make({
    id: "CircuitSimulator",
    name: "直流电路实验室",
    subject: "physics",
    description:
      "用电池、电阻、灯泡、开关、导线、电压表、电流表建立直流网络；节点0接地，电池value为电压，电阻为欧姆；真实MNA求解。",
    inputSchema: circuitSchema.omit({ kind: true }),
    visualRenderer: "circuit",
    execute: (i) => {
      const state = circuitSchema.parse({ kind: "circuit", ...(i as object) });
      return { state, result: solveCircuit(state.components) };
    },
  }),
  make({
    id: "IonFormation",
    name: "离子形成",
    subject: "chemistry",
    description: "显示 Na/Cl/Mg/O/H/C 的电子层和离子形成，标明教学简化模型。",
    inputSchema: atomSchema.omit({ kind: true }),
    visualRenderer: "atom",
    execute: (i) => {
      const state = atomSchema.parse({ kind: "atom", ...(i as object) });
      return { state, result: atomInfo(state.element, state.ion) };
    },
  }),
  make({
    id: "ChemicalEquationBalancer",
    name: "化学方程式配平",
    subject: "chemistry",
    description:
      "通过元素质量守恒配平化学方程式，支持括号，不支持离子氧化还原方程。",
    inputSchema: z.object({ equation: z.string().min(3).max(300) }),
    visualRenderer: "result",
    execute: (i) => ({
      result: balanceEquation((i as { equation: string }).equation),
    }),
  }),
  make({
    id: "CellExplorer",
    name: "细胞结构",
    subject: "biology",
    description: "选择细胞膜、细胞质、细胞核或线粒体教学模型。",
    inputSchema: cellSchema.omit({ kind: true }),
    visualRenderer: "cell",
    execute: (i) => {
      const state = cellSchema.parse({ kind: "cell", ...(i as object) });
      return {
        state,
        result: { selected: state.selected, model: "动物细胞二维简化示意" },
      };
    },
  }),
  make({
    id: "GeometryCanvas",
    name: "几何画布",
    subject: "math",
    description:
      "按顺序给出3到8个多边形顶点，计算边长周长面积；学生可拖动顶点。",
    inputSchema: geometrySchema.omit({ kind: true }),
    visualRenderer: "geometry",
    execute: (i) => {
      const state = geometrySchema.parse({
        kind: "geometry",
        ...(i as object),
      });
      return { state, result: geometry(state.points) };
    },
  }),
  make({
    id: "MotionSimulator",
    name: "抛体运动",
    subject: "physics",
    description:
      "理想抛体运动：初速度m/s、角度degree、重力m/s²、时间s。无阻力，同高度落地。",
    inputSchema: motionSchema.omit({ kind: true }),
    visualRenderer: "motion",
    execute: (i) => {
      const state = motionSchema.parse({ kind: "motion", ...(i as object) });
      return {
        state,
        result: projectile(state.speed, state.angle, state.gravity, state.time),
      };
    },
  }),
  make({
    id: "ForceVisualizer",
    name: "力的合成",
    subject: "physics",
    description: "二维共点力向量合成，vectors数组含x/y分量（N）。",
    inputSchema: forcesSchema.omit({ kind: true }),
    visualRenderer: "forces",
    execute: (i) => {
      const state = forcesSchema.parse({ kind: "forces", ...(i as object) }),
        sum = state.vectors.reduce((s, v) => ({ x: s.x + v.x, y: s.y + v.y }), {
          x: 0,
          y: 0,
        });
      return { state, result: { ...sum, magnitude: Math.hypot(sum.x, sum.y) } };
    },
  }),
  make({
    id: "OpticsSimulator",
    name: "薄透镜成像",
    subject: "physics",
    description:
      "凸薄透镜近轴模型，focal焦距、distance正物距、height物高均为cm。",
    inputSchema: opticsSchema.omit({ kind: true }),
    visualRenderer: "optics",
    execute: (i) => {
      const state = opticsSchema.parse({ kind: "optics", ...(i as object) });
      return { state, result: lens(state.focal, state.distance, state.height) };
    },
  }),
  make({
    id: "MoleculeViewer",
    name: "三维分子模型",
    subject: "chemistry",
    description:
      "显示H2O、CO2、CH4或O2理想化三维球棍教学模型，可旋转，不是量子计算。",
    inputSchema: moleculeSchema.omit({ kind: true }),
    visualRenderer: "molecule",
    execute: (i) => {
      const state = moleculeSchema.parse({
        kind: "molecule",
        ...(i as object),
      });
      return {
        state,
        result: {
          formula: state.formula,
          model: "理想化参考几何，非量子计算或能量最小化",
        },
      };
    },
  }),
  make({
    id: "DnaExplorer",
    name: "DNA配对",
    subject: "biology",
    description:
      "根据ATGC序列生成反向平行的互补链和GC比例。输入序列5到3方向，结果互补链3到5方向。",
    inputSchema: dnaSchema.omit({ kind: true }),
    visualRenderer: "dna",
    execute: (i) => {
      const state = dnaSchema.parse({ kind: "dna", ...(i as object) });
      return {
        state,
        result: {
          complement: dnaComplement(state.sequence),
          orientation: "3′→5′",
          gcRatio:
            state.sequence.split("").filter((c) => c === "G" || c === "C")
              .length / state.sequence.length,
        },
      };
    },
  }),
  ...(["chinese", "english"] as const).map((subject) =>
    make({
      id: subject === "chinese" ? "ReadingCanvas" : "SentenceCanvas",
      name: subject === "chinese" ? "阅读与结构笔记" : "句子分析与词汇",
      subject,
      description: "将原文和教学分析写入可编辑学习画布，不自动覆盖学生笔记。",
      inputSchema: readingSchema.omit({ kind: true }),
      visualRenderer: "reading",
      execute: (i) => {
        const state = readingSchema.parse({
          kind: "reading",
          ...(i as object),
        });
        return { state, result: { characters: state.text.length } };
      },
    }),
  ),
];
export function executeSkill(id: string, input: unknown, subject: SubjectId) {
  const s = skillRegistry.find(
    (s) => s.id === id && (s.subject === subject || s.subject === "all"),
  );
  if (!s) throw new Error("此学科无权调用该工具");
  const args = s.inputSchema.parse(input);
  return s.outputSchema.parse(s.execute(args)) as {
    result: unknown;
    state?: LabState;
  };
}
