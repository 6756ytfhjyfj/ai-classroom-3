import { describe, it, expect } from "vitest";
import {
  solveCircuit,
  quadratic,
  atomInfo,
  balanceEquation,
} from "../shared/solvers";
import { componentSchema } from "../shared/protocol";
import { executeSkill } from "../shared/skills";
const c = (
  kind: string,
  id: string,
  a: string,
  b: string,
  value: number,
  closed = true,
) => componentSchema.parse({ kind, id, a, b, value, closed });
describe("真实教学计算器", () => {
  it("计算二次函数与退化直线", () => {
    expect(quadratic(1, 0, -4).roots).toEqual([-2, 2]);
    expect(quadratic(0, 2, -6).roots).toEqual([3]);
    expect(quadratic(1, 0, 4).roots).toEqual([]);
  });
  it("MNA 正确计算串联电流", () => {
    const r = solveCircuit([
      c("battery", "V", "1", "0", 12),
      c("resistor", "R1", "1", "2", 10),
      c("resistor", "R2", "2", "0", 20),
    ]);
    expect(r.status).toBe("ok");
    expect(r.currents.R1).toBeCloseTo(0.4);
    expect(r.currents.R2).toBeCloseTo(0.4);
    expect(r.voltages["2"]).toBeCloseTo(8);
  });
  it("MNA 并联电流与电源功率守恒", () => {
    const r = solveCircuit([
      c("battery", "V", "1", "0", 12),
      c("resistor", "R1", "1", "0", 10),
      c("resistor", "R2", "1", "0", 20),
    ]);
    expect(r.currents.V).toBeCloseTo(-1.8);
    expect(Object.values(r.power).reduce((a, b) => a + b, 0)).toBeCloseTo(0);
  });
  it("开关断开与短路安全反馈", () => {
    const r = solveCircuit([
      c("battery", "V", "1", "0", 6),
      c("wire", "W", "1", "0", 0),
    ]);
    expect(r.status).toBe("short");
    const open = solveCircuit([
      c("battery", "V", "1", "0", 6),
      c("resistor", "R", "1", "2", 10),
      c("switch", "S", "2", "0", 0, false),
    ]);
    expect(open.currents.R).toBeCloseTo(0);
  });
  it("离子电荷与电子总数一致", () => {
    expect(atomInfo("Na", true).shells).toEqual([2, 8]);
    expect(atomInfo("Cl", true).electrons).toBe(18);
    expect(atomInfo("Mg", true).charge).toBe(2);
  });
  it("配平支持括号并验证质量守恒", () => {
    expect(balanceEquation("Fe + O2 -> Fe2O3").coefficients).toEqual([4, 3, 2]);
    expect(
      balanceEquation("Ca(OH)2 + HCl -> CaCl2 + H2O").coefficients,
    ).toEqual([1, 2, 1, 2]);
    expect(() => balanceEquation("H2 -> CO2")).toThrow();
  });
  it("拒绝跨学科和非法 Skill 参数", () => {
    expect(() => executeSkill("CircuitSimulator", {}, "math")).toThrow();
    expect(() =>
      executeSkill("FunctionGraph", { a: 100, b: 0, c: 0 }, "math"),
    ).toThrow();
  });
});
