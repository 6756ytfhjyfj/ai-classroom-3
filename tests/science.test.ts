import { describe, it, expect } from "vitest";
import { compileExpression, numericRoots } from "../shared/expressions";
import { projectile, lens, geometry, dnaComplement } from "../shared/science";
describe("扩展实验与表达式安全", () => {
  it("函数遵守运算优先级和参数，不执行代码", () => {
    expect(compileExpression("-x^2+2*x")(3)).toBe(-3);
    expect(compileExpression("a*sin(x)+c")(Math.PI / 2, 2, 0, 1)).toBeCloseTo(
      3,
    );
    expect(compileExpression("2^3^2")(0)).toBe(512);
    for (const bad of [
      "globalThis",
      "constructor()",
      "x=3",
      "x.foo",
      "fetch(1)",
      "sin(x);alert(1)",
    ])
      expect(() => compileExpression(bad)).toThrow();
  });
  it("数值求根跳过不连续假根", () => {
    expect(numericRoots((x) => x * x - 4)).toEqual([-2, 2]);
    expect(numericRoots((x) => 1 / x)).toEqual([]);
  });
  it("抛体射程与轨迹满足解析公式", () => {
    const r = projectile(10, 45, 10, 1);
    expect(r.range).toBeCloseTo(10);
    expect(r.flight).toBeCloseTo(Math.SQRT2);
    expect(r.maxHeight).toBeCloseTo(2.5);
    expect(projectile(10, 45, 10, 5).y).toBe(0);
  });
  it("薄透镜实像、虚像与焦点奇点", () => {
    expect(lens(5, 10, 2).imageDistance).toBe(10);
    expect(lens(5, 2.5, 2).magnification).toBe(2);
    expect(lens(5, 5, 2).imageDistance).toBeNull();
  });
  it("几何与DNA配对计算", () => {
    expect(
      geometry([
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 0, y: 4 },
      ]),
    ).toMatchObject({ area: 6, perimeter: 12 });
    expect(dnaComplement("ATGC")).toBe("TACG");
  });
});
