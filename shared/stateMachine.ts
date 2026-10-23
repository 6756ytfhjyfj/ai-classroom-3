import type { ClassroomState } from "./protocol";
const control = new Set<ClassroomState>([
  "IDLE",
  "AI_INTERRUPTED",
  "HANDWRITING",
  "VOICE_LISTENING",
  "INPUT_REVIEW",
  "ERROR_RECOVERY",
]);
const nextStates: Record<ClassroomState, ClassroomState[]> = {
  IDLE: ["AI_THINKING", "AI_SPEAKING", "TEACHING"],
  TEACHING: ["AI_THINKING", "AI_SPEAKING", "TOOL_EXECUTING"],
  AI_THINKING: ["TOOL_EXECUTING", "AI_SPEAKING", "TEACHING"],
  TOOL_EXECUTING: ["AI_THINKING", "AI_SPEAKING", "TEACHING"],
  AI_SPEAKING: ["AI_THINKING", "TEACHING", "TOOL_EXECUTING"],
  AI_INTERRUPTED: ["AI_THINKING", "AI_SPEAKING", "TEACHING"],
  HANDWRITING: ["HANDWRITING_RECOGNIZING"],
  HANDWRITING_RECOGNIZING: [],
  VOICE_LISTENING: [],
  INPUT_REVIEW: ["AI_THINKING"],
  ERROR_RECOVERY: ["AI_THINKING", "TEACHING"],
};
export function transition(
  current: ClassroomState,
  next: ClassroomState,
): ClassroomState {
  return current === next ||
    control.has(next) ||
    nextStates[current].includes(next)
    ? next
    : current;
}
