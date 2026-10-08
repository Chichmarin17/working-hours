import { useState } from 'react';
import { addDays, formatHM, startOfWeek } from '../domain/time';
import { weekGrid } from '../domain/totals';
import { DayPanel } from './DayPanel';
import type { AppStore } from './useAppData';

type Props = { store: AppStore; now: number };

const dayLabel = (day: number) =>
  new Date(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function WeekView({ store, now }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(now));
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const grid = weekGrid(store.data.entries, weekStart, now);
  const projectsById = new Map(store.data.projects.map((p) => [p.id, p]));

  const goTo = (start: number) => {
    setWeekStart(start);
    setSelectedDay(null);
  };

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>
            Week of {new Date(weekStart).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
          </h2>
          <div className="row">
            <button type="button" aria-label="Previous week" onClick={() => goTo(addDays(weekStart, -7))}>
              ←
            </button>
            <button type="button" onClick={() => goTo(startOfWeek(Date.now()))}>
              This week
            </button>
            <button type="button" aria-label="Next week" onClick={() => goTo(addDays(weekStart, 7))}>
              →
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                {grid.days.map((day) => (
                  <th key={day}>
                    <button
                      type="button"
                      aria-pressed={selectedDay === day}
                      onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                    >
                      {dayLabel(day)}
                    </button>
                  </th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted">
                    No time tracked this week. Click a day to add an entry.
                  </td>
                </tr>
              )}
              {grid.rows.map((row) => {
                const project = projectsById.get(row.projectId);
                return (
                  <tr key={row.projectId}>
                    <td>
                      <span className="dot" style={{ background: project?.color ?? 'gray' }} />
                      {project?.name ?? 'Unknown project'}
                    </td>
                    {row.perDay.map((ms, i) => (
                      <td key={i}>{ms > 0 ? formatHM(ms) : '–'}</td>
                    ))}
                    <td>{formatHM(row.total)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                {grid.dayTotals.map((ms, i) => (
                  <td key={i}>{formatHM(ms)}</td>
                ))}
                <td>{formatHM(grid.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      {selectedDay !== null && (
        <DayPanel
          key={selectedDay}
          store={store}
          now={now}
          dayStart={selectedDay}
          title={new Date(selectedDay).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        />
      )}
    </>
  );
}
