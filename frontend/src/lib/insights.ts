import { derivePlan } from './plan';
import {
  formatDuration,
  formatKm,
  fromIsoDate,
  lastWeekStarts,
  paceSecondsPerKm,
  roundKm,
  totalsForWeek,
  type Run,
  type WeekTotals,
} from './runs';

// Insight cards and previous plans for the AI Coach page (RUN-34, AIC-6/7).
// Everything here derives from the runs store at render time, the same
// derive-in-render contract the plan card follows (RUN-32): no insight or
// outcome is ever stored, so edits and deletions can never leave stale
// numbers behind.
//
// Every window counts *full* Mon-Sun weeks and excludes the running week: a
// fixed four-week denominator over a window that grows during the week would
// under-report load and cadence every Monday and drift back by Sunday. The
// copy says "full weeks" for the same reason.

const INSIGHT_WEEKS = 4;

export interface Insight {
  key: 'load' | 'pace' | 'consistency';
  label: string;
  value: string;
  caption: string;
}

function sumTotals(weeks: WeekTotals[]): WeekTotals {
  return weeks.reduce(
    (sum, week) => ({
      distanceKm: sum.distanceKm + week.distanceKm,
      durationSeconds: sum.durationSeconds + week.durationSeconds,
      runCount: sum.runCount + week.runCount,
    }),
    { distanceKm: 0, durationSeconds: 0, runCount: 0 },
  );
}

// A spike is one week towering over the runner's other active weeks: half
// again their average and meaningfully bigger in absolute terms, so a 5 km
// week next to a 6 km week never trips it. A single active week is a runner
// getting started, not a spike, so it stays unjudged.
const SPIKE_RATIO = 1.5;
const SPIKE_MIN_DELTA_KM = 3;

function loadCaption(weekly: number[]): string {
  const active = weekly.filter((km) => km > 0);
  if (active.length < 2) return 'Over the last 4 full weeks';
  const max = Math.max(...active);
  const othersMean = (active.reduce((sum, km) => sum + km, 0) - max) / (active.length - 1);
  return max > SPIKE_RATIO * othersMean && max - othersMean >= SPIKE_MIN_DELTA_KM
    ? 'Includes a spike week in the last 4 full weeks'
    : 'Steady over the last 4 full weeks, no spikes';
}

// Whole runs-per-week figures drop the decimal ("3 / week"), fractional ones
// keep one ("2.5 / week"): rounding 2 runs a month up to "1 / week" would
// double the truth.
function formatPerWeek(perWeek: number): string {
  return Number.isInteger(perWeek) ? `${perWeek}` : perWeek.toFixed(1);
}

// The mock's captions ("4% faster than last month", "Right on your planned
// cadence") are illustrative; these derive the honest equivalent and say so
// plainly when there is not enough history to compare against.
export function deriveInsights(runs: Run[], goalKm: number, isoToday: string): Insight[] {
  // 2x4 full weeks plus the excluded running week at the end.
  const weeks = lastWeekStarts(isoToday, 2 * INSIGHT_WEEKS + 1);
  const windowTotals = weeks
    .slice(INSIGHT_WEEKS, 2 * INSIGHT_WEEKS)
    .map((weekStart) => totalsForWeek(runs, weekStart));
  const window = sumTotals(windowTotals);
  const prior = sumTotals(
    weeks.slice(0, INSIGHT_WEEKS).map((weekStart) => totalsForWeek(runs, weekStart)),
  );

  const load: Insight = {
    key: 'load',
    label: 'Recent load',
    value: `${formatKm(roundKm(window.distanceKm))} km`,
    caption: loadCaption(windowTotals.map((week) => week.distanceKm)),
  };

  let pace: Insight;
  if (window.distanceKm === 0) {
    pace = {
      key: 'pace',
      label: 'Pace trend',
      value: 'No pace yet',
      caption: 'Nothing logged in the last 4 full weeks',
    };
  } else {
    const windowPace = paceSecondsPerKm(window);
    const value = `${formatDuration(windowPace)} /km`;
    const priorPace = prior.distanceKm > 0 ? paceSecondsPerKm(prior) : null;
    // The finiteness guard covers hand-edited storage (a zero duration would
    // make the division blow up into an "Infinity% slower" caption).
    if (priorPace === null || !Number.isFinite(priorPace) || priorPace <= 0) {
      pace = { key: 'pace', label: 'Pace trend', value, caption: 'Your first month of pace data' };
    } else {
      const percent = Math.round(((priorPace - windowPace) / priorPace) * 100);
      // Under 2% either way is measurement noise over a handful of runs,
      // not a trend worth announcing.
      const caption =
        percent >= 2
          ? `${percent}% faster than last month`
          : percent <= -2
            ? `${-percent}% slower than last month`
            : 'Level with last month';
      pace = { key: 'pace', label: 'Pace trend', value, caption };
    }
  }

  // Actual cadence over the four full weeks, judged against the current
  // plan's session bracket: the plan is the only "planned cadence" that
  // exists, and the caption answers whether the runner's habit matches what
  // this week's plan asks. Both sides use the displayed one-decimal figure,
  // so the value and the judgment can never disagree.
  const perWeek = Math.round((window.runCount / INSIGHT_WEEKS) * 10) / 10;
  const plan = derivePlan(runs, goalKm, isoToday);
  const consistency: Insight = {
    key: 'consistency',
    label: 'Consistency',
    value: `${formatPerWeek(perWeek)} / week`,
    caption:
      perWeek < plan.sessionsMin
        ? 'Below your planned cadence'
        : perWeek > plan.sessionsMax
          ? 'Ahead of your planned cadence'
          : 'Right on your planned cadence',
  };

  return [load, pace, consistency];
}

/* Previous plans (AIC-7) ----------------------------------------------------- */

export interface PastPlan {
  weekStart: string;
  label: string;
  targetKm: number;
  ranKm: number;
  hit: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Jun 24 – 30" within one month, "Jun 29 – Jul 5" across a boundary.
// fromIsoDate builds a *local* date from its parts, so the local getters
// below can never slip a day west of Greenwich.
export function formatWeekRange(weekStart: string): string {
  const monday = fromIsoDate(weekStart);
  const sunday = fromIsoDate(weekStart);
  sunday.setDate(sunday.getDate() + 6);
  const from = `${MONTHS[monday.getMonth()]} ${monday.getDate()}`;
  return monday.getMonth() === sunday.getMonth()
    ? `${from} – ${sunday.getDate()}`
    : `${from} – ${MONTHS[sunday.getMonth()]} ${sunday.getDate()}`;
}

export const PAST_PLAN_COUNT = 3;

// The plans past weeks would have shown, recomputed with the same derivation
// the live card uses (derivePlan reads the week before the given date). The
// walk goes newest-first and *stops* at the first week without a derivable
// plan: a week that followed an empty one got its target from whatever the
// goal was at the time, and goal history is not stored, so inventing a row
// from today's goal would fabricate the past, while skipping over it would
// punch a silent hole into a list that presents itself as contiguous.
// Outcomes compare the numbers the row displays (AC3): rounded ran km
// against the plan's whole-km target, so the chip never contradicts them.
export function derivePastPlans(runs: Run[], goalKm: number, isoToday: string): PastPlan[] {
  // The display count, one reference week before the oldest candidate, and
  // the current week at the end (excluded: it belongs to the live card).
  const weeks = lastWeekStarts(isoToday, PAST_PLAN_COUNT + 2);
  const plans: PastPlan[] = [];
  for (let i = weeks.length - 2; i >= 1; i--) {
    if (totalsForWeek(runs, weeks[i - 1]).distanceKm === 0) break;
    const targetKm = derivePlan(runs, goalKm, weeks[i]).targetKm;
    const ranKm = roundKm(totalsForWeek(runs, weeks[i]).distanceKm);
    plans.push({
      weekStart: weeks[i],
      label: formatWeekRange(weeks[i]),
      targetKm,
      ranKm,
      hit: ranKm >= targetKm,
    });
  }
  return plans;
}
