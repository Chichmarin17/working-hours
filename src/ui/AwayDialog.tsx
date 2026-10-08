import type { AwayChoice } from '../domain/away';
import { dayKey, formatHM, timeOfDay, toMs } from '../domain/time';
import type { PendingAway } from '../domain/types';

type Props = { pending: PendingAway; projectName: string; onChoose: (choice: AwayChoice) => void };

export function AwayDialog({ pending, projectName, onChoose }: Props) {
  const from = toMs(pending.from);
  const to = toMs(pending.to);
  const toLabel = dayKey(to) === dayKey(from) ? timeOfDay(to) : `${timeOfDay(to)} on ${dayKey(to)}`;

  return (
    <div className="overlay">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="away-title">
        <h2 id="away-title">Were you working?</h2>
        <p>
          You were away {timeOfDay(from)} → {toLabel} ({formatHM(to - from)}) while “{projectName}” was running.
        </p>
        <div className="row">
          <button type="button" onClick={() => onChoose('keep')}>
            Keep as work
          </button>
          <button type="button" className="primary" autoFocus onClick={() => onChoose('discard')}>
            Discard away time
          </button>
          <button type="button" onClick={() => onChoose('stop')}>
            Stop timer at {timeOfDay(from)}
          </button>
        </div>
      </div>
    </div>
  );
}
