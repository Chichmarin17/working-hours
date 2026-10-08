interface IdleDetectorStartOptions {
  threshold: number;
  signal?: AbortSignal;
}

declare class IdleDetector extends EventTarget {
  readonly userState: 'active' | 'idle' | null;
  readonly screenState: 'locked' | 'unlocked' | null;
  start(options: IdleDetectorStartOptions): Promise<void>;
  static requestPermission(): Promise<'granted' | 'denied'>;
}
