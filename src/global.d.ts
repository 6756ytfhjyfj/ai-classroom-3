export {};
declare global {
  interface Window {
    desktop?: {
      deviceRead: () => Promise<{
        installationId: string;
        secret: string;
      } | null>;
      deviceWrite: (d: {
        installationId: string;
        secret: string;
      }) => Promise<boolean>;
      fullscreen: (v: boolean) => Promise<boolean>;
      speechStart: (lang: string) => Promise<boolean>;
      speechStop: () => Promise<boolean>;
      speechSubscribe: (
        callback: (e: {
          type: string;
          text?: string;
          message?: string;
        }) => void,
      ) => () => void;
      version: () => Promise<string>;
    };
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
  interface SpeechRecognitionLike {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult:
      | ((e: {
          resultIndex: number;
          results: {
            length: number;
            [index: number]: {
              isFinal: boolean;
              [index: number]: { transcript: string };
            };
          };
        }) => void)
      | null;
    onerror: ((e: { error: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
  }
}
