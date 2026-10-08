import { useEffect } from 'react';
import { heartbeatAction } from '../domain/appActions';
import type { AppStore } from './useAppData';

export const HEARTBEAT_MS = 30_000;

/** Updates lastSeen while a timer runs; a jump since the last beat means the Mac slept or the page was closed. */
export function useHeartbeat(update: AppStore['update']): void {
  useEffect(() => {
    const beat = () => update((d) => heartbeatAction(d, Date.now()));
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat();
    };
    beat();
    const id = window.setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', beat);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', beat);
    };
  }, [update]);
}
