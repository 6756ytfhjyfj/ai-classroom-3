import { describe, it, expect } from "vitest";
import { transition } from "../shared/stateMachine";
describe("课堂状态机", () => {
  it("书写和录音优先，旧AI事件不能夺回界面", () => {
    expect(transition("HANDWRITING", "AI_SPEAKING")).toBe("HANDWRITING");
    expect(transition("VOICE_LISTENING", "TOOL_EXECUTING")).toBe(
      "VOICE_LISTENING",
    );
    expect(transition("HANDWRITING_RECOGNIZING", "TEACHING")).toBe(
      "HANDWRITING_RECOGNIZING",
    );
  });
  it("打断后可以立即开始新输入并提交", () => {
    expect(transition("AI_SPEAKING", "AI_INTERRUPTED")).toBe("AI_INTERRUPTED");
    expect(transition("AI_INTERRUPTED", "HANDWRITING")).toBe("HANDWRITING");
    expect(transition("INPUT_REVIEW", "AI_THINKING")).toBe("AI_THINKING");
  });
  it("后台识别只在书写中启动", () => {
    expect(transition("IDLE", "HANDWRITING_RECOGNIZING")).toBe("IDLE");
    expect(transition("HANDWRITING", "HANDWRITING_RECOGNIZING")).toBe(
      "HANDWRITING_RECOGNIZING",
    );
    expect(transition("HANDWRITING_RECOGNIZING", "HANDWRITING")).toBe(
      "HANDWRITING",
    );
  });
});
