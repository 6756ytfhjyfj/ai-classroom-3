import { create } from "zustand";
import type { ClassroomState } from "../../shared/protocol";
import { transition } from "../../shared/stateMachine";
interface ClassroomUI {
  status: ClassroomState;
  theme: "light" | "dark";
  speech: boolean;
  rate: number;
  volume: number;
  setStatus: (s: ClassroomState) => void;
  setTheme: (t: "light" | "dark") => void;
  setSpeech: (v: boolean) => void;
  setRate: (v: number) => void;
  setVolume: (v: number) => void;
}
export const useClassroomUI = create<ClassroomUI>((set) => ({
  status: "IDLE",
  theme: localStorage.getItem("theme") === "dark" ? "dark" : "light",
  speech: false,
  rate: 1,
  volume: 1,
  setStatus: (next) => set((s) => ({ status: transition(s.status, next) })),
  setTheme: (theme) => {
    localStorage.setItem("theme", theme);
    set({ theme });
  },
  setSpeech: (speech) => set({ speech }),
  setRate: (rate) => set({ rate }),
  setVolume: (volume) => set({ volume }),
}));
