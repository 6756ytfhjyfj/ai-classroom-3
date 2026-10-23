export class TeacherVoice {
  private generation = 0;
  onState: (s: "speaking" | "paused" | "idle") => void = () => {};
  speak(text: string, rate = 1, volume = 1) {
    this.stop();
    const gen = this.generation;
    const clean = text
      .replace(/```[\s\S]*?```/g, "代码内容见屏幕")
      .replace(/[#*_`$]/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    const parts = clean.match(/[^。！？.!?\n]+[。！？.!?\n]?/g) ?? [clean];
    const next = (i: number) => {
      if (gen !== this.generation || i >= parts.length) {
        if (gen === this.generation) this.onState("idle");
        return;
      }
      const u = new SpeechSynthesisUtterance(parts[i]);
      u.lang = "zh-CN";
      u.rate = rate;
      u.volume = volume;
      const voices = speechSynthesis.getVoices();
      u.voice = voices.find((v) => v.lang.startsWith("zh")) ?? null;
      u.onstart = () => this.onState("speaking");
      u.onend = () => next(i + 1);
      u.onerror = () => {
        if (gen === this.generation) this.onState("idle");
      };
      speechSynthesis.speak(u);
    };
    next(0);
  }
  pause() {
    speechSynthesis.pause();
    this.onState("paused");
  }
  resume() {
    speechSynthesis.resume();
    this.onState("speaking");
  }
  stop() {
    this.generation++;
    speechSynthesis.cancel();
    this.onState("idle");
  }
}
export const teacherVoice = new TeacherVoice();
