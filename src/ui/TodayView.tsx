import { startOfDay } from '../domain/time';
import { DayPanel } from './DayPanel';
import { TimerBar } from './TimerBar';
import type { AppStore } from './useAppData';

type Props = { store: AppStore; now: number; onGoToProjects: () => void };

export function TodayView({ store, now, onGoToProjects }: Props) {
  const today = startOfDay(now);
  return (
    <>
      <TimerBar store={store} now={now} onGoToProjects={onGoToProjects} />
      <DayPanel key={today} store={store} now={now} dayStart={today} title="Today" />
    </>
  );
}
