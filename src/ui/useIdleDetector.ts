import { useEffect, useRef } from 'react';
import type { Period } from '../domain/away';

const IDLE_THRESHOLD_MS = 60_000;

/** Reports an away period when the user returns from inactivity or a locked screen (Chrome/Edge). */
export function useIdleDetector(enabled: boolean, onAway: (period: Period) => void, onUnavailable: () => void): void {
  const callbacks = useRef({ onAway, onUnavailable });
  callbacks.current = { onAway, onUnavailable };

  useEffect(() => {
    if (!enabled) return;
    if (!('IdleDetector' in window)) {
      callbacks.current.onUnavailable();
      return;
    }
    const controller = new AbortController();
    const detector = new IdleDetector();
    let awaySince: number | null = null;

    detector.addEventListener('change', () => {
      const now = Date.now();
      const idle = detector.userState === 'idle';
      const locked = detector.screenState === 'locked';
      if ((idle || locked) && awaySince === null) {
        // "idle" fires after a minute without input; a lock can happen right away.
        awaySince = idle ? now - IDLE_THRESHOLD_MS : now;
      } else if (!idle && !locked && awaySince !== null) {
        callbacks.current.onAway({ from: awaySince, to: now });
        awaySince = null;
      }
    });

    detector.start({ threshold: IDLE_THRESHOLD_MS, signal: controller.signal }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) callbacks.current.onUnavailable();
    });

    return () => controller.abort();
  }, [enabled]);
}
