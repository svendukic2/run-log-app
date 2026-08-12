// The demo dataset (RUN-71) as PLAIN DATA: users, their run history, the
// follow web, a handful of notifications and one active event. Nothing here
// touches Prisma, and that split is the point. There is no local database on
// a fresh clone, so this half is where the acceptance criteria that can be
// proved without one - realistic, never-flagged runs (AC3) and a dataset
// shaped so the leaderboard and event pages look alive (AC1) - actually get
// proved, in demo-data.spec.ts. seed-demo-data.ts is then a thin, boring
// writer, and CI's Postgres is what exercises it.
//
// Deterministic on purpose (house rule): one seeded Faker instance, its own
// instance rather than the shared global one so a test importing this module
// cannot perturb anyone else's faker state, and every date derived from the
// `today` argument. Same `today`, same dataset, down to the last note.
import { Faker, en } from '@faker-js/faker';
import { addDaysIso, mondayOf, utcTodayIso } from '../common/dates';
import { PRIVACY_DEFAULTS, type PrivacySettings } from '../common/privacy';
// TYPE-only imports, and deliberately so: they are erased at compile time,
// which is what keeps this module free of the DTOs' class-validator
// decorator runtime (importing them for real needs reflect-metadata loaded
// first) while still failing the build if either vocabulary changes under
// it.
import type { Effort } from '../runs/dto/create-run.dto';
import type { RunningLevel } from '../profile/dto/put-profile.dto';

/* The RUN-72 contract ----------------------------------------------------- */

// The authoritative limits live in common/runLimits.ts (RUN-72) and are NOT
// repeated here. This module does not import them either: it does not need
// to decide anything at generation time, it needs to stay well clear, and
// the spec is where the two are actually reconciled - it runs every
// generated run through RUN-72's own runLimitViolation() and isOutlierRun(),
// so demo data cannot drift past the rules that guard real data even if
// those rules change.
//
// AC3 is "no flagged demo data", which is stricter than "legal": a run
// inside RUN_LIMITS but past RUN_OUTLIER_THRESHOLDS is still legal, still
// stored, and still marked unverified on every leaderboard. So the
// generator has to stay inside the SOFT thresholds too. These are the bounds
// it generates within, deliberately well clear of them rather than pressed
// against them - a demo dataset that only just escapes being flagged would
// be one rounding change away from failing. Amateur paces and distances sit
// here naturally, so the margin costs nothing.
export const DEMO_RUN_BOUNDS = {
  fastestPaceSecPerKm: 240, // 4:00 /km, comfortably slower than 3:30
  slowestPaceSecPerKm: 480, // 8:00 /km, nowhere near the 20:00 floor
  maxDistanceKm: 30, // half of the 60 km outlier threshold
} as const;

/* Demo identity ----------------------------------------------------------- */

// The idempotency marker (AC2). Every seeded account lives on this domain
// and nothing else does, so the seeder can find and replace exactly its own
// rows without a schema column to mark them with.
//
// The separation is a CONVENTION, not a guarantee: `.demo` is a real
// delegated gTLD, not one of RFC 2606's reserved names, so nothing at the
// protocol level stops someone signing up as name@runlog.demo and being
// deleted by the next seed. Nothing stops them typing any other marker
// either - the alternative, a column on User, is a migration this ticket
// deliberately does not make. Worth knowing before widening what the marker
// matches.
export const DEMO_EMAIL_DOMAIN = 'runlog.demo';

// AC4: one shared password for every seeded account, documented in
// docs/data-model.md. Deliberately unmistakable as demo-only - it names
// itself - and comfortably over the signup DTO's 8 character floor, so a
// seeded account is a normal account in every respect.
export const DEMO_PASSWORD = 'demo-only-password';

// The account to sign in as during a demo: a fixed address, unlike the
// other fourteen whose names faker invents, so the docs can name it.
export const DEMO_PRIMARY_EMAIL = `ana.demo@${DEMO_EMAIL_DOMAIN}`;

export const DEMO_USER_COUNT = 15;

// Any fixed integer would do; this one is the ticket's date. Changing it
// reshuffles every name, distance and note, which is precisely why it is a
// named constant and not a literal buried in a call.
export const DEMO_FAKER_SEED = 20260812;

/* The dataset ------------------------------------------------------------- */

export interface DemoRun {
  routeName: string;
  distanceKm: number;
  durationSeconds: number;
  date: string; // yyyy-mm-dd
  effort: Effort;
  note: string;
}

export interface DemoUser {
  email: string;
  firstName: string;
  lastName: string;
  privacy: PrivacySettings;
  runningLevel: RunningLevel;
  weeklyGoalKm: number;
  // The Goal row's start day; the goal itself runs open-ended (endDate null,
  // "No end date" on screen), which is what an ongoing demo account looks
  // like.
  goalStartDate: string;
  runs: DemoRun[];
}

export interface DemoFollow {
  followerEmail: string;
  followeeEmail: string;
}

// Only 'new-follower' notifications, and only for the primary account. See
// buildNotifications below for why that is the whole of it.
export interface DemoNotification {
  userEmail: string;
  actorEmail: string;
}

export interface DemoEvent {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  targetKm: number;
  ownerEmail: string;
  participantEmails: string[];
}

export interface DemoDataset {
  users: DemoUser[];
  follows: DemoFollow[];
  notifications: DemoNotification[];
  event: DemoEvent;
}

/* Generation -------------------------------------------------------------- */

// What each running level looks like in the data. Every pace range sits
// inside DEMO_RUN_BOUNDS by construction, and the clamp in buildRun is the
// belt to this braces: a future edit that widens a range too far gets pulled
// back rather than quietly seeding a flagged run.
interface LevelProfile {
  level: RunningLevel;
  weeklyGoalKm: number;
  runsPerWeek: [number, number];
  easyDistanceKm: [number, number];
  longDistanceKm: [number, number];
  paceSecPerKm: [number, number];
}

// weeklyGoalKm is set to roughly the MEAN weekly volume the ranges beside it
// produce, which is the whole reason those two numbers are declared
// together. Pick a rounder, lower goal and every demo account beats its
// target in almost every week: the dashboard's goal card sits pegged past
// 100% and the Hit/Missed history is a wall of Hits, so the goal feature
// demos only its success state. Matching the mean makes a week roughly a
// coin flip, which is what makes that history worth looking at.
//
// The Advanced volumes are trimmed for the same reason from the other
// direction: its natural mean was ~66 km, and a goal cannot exceed
// GOAL_MAX_KM (60), so the goal could not have matched it.
const LEVEL_PROFILES: readonly LevelProfile[] = [
  {
    level: 'Beginner',
    weeklyGoalKm: 22,
    runsPerWeek: [3, 4],
    easyDistanceKm: [3, 7],
    longDistanceKm: [8, 12],
    paceSecPerKm: [390, 450], // 6:30 - 7:30 /km
  },
  {
    level: 'Intermediate',
    weeklyGoalKm: 43,
    runsPerWeek: [3, 5],
    easyDistanceKm: [5, 12],
    longDistanceKm: [14, 20],
    paceSecPerKm: [315, 375], // 5:15 - 6:15 /km
  },
  {
    level: 'Advanced',
    weeklyGoalKm: 57,
    runsPerWeek: [4, 5],
    easyDistanceKm: [7, 13],
    longDistanceKm: [19, 25],
    paceSecPerKm: [255, 300], // 4:15 - 5:00 /km
  },
];

// Route names a runner would actually recognise on their own dashboard.
// A fixed list rather than faker.location.street(): generated street names
// read as noise in a demo, and the point of the seeder is a screen someone
// can talk over.
const ROUTE_NAMES = [
  'Riverside loop',
  'Park intervals',
  'Lakeside out and back',
  'Old town circuit',
  'Hill repeats',
  'Canal path',
  'Forest trail',
  'Stadium track session',
  'Harbour promenade',
  'Sunday long run',
  'Morning commute run',
  'Botanical gardens loop',
];

// Everything that is not the weekly long run. Typed as Effort, so a change
// to EFFORT_LEVELS in the runs DTO breaks the build here rather than seeding
// a value the API would reject.
const LIGHT_EFFORTS: readonly Effort[] = ['Easy', 'Medium'];

const RUN_NOTES = [
  'Legs felt heavy at the start, better after 3 km.',
  'Great weather, easy effort throughout.',
  'Held back on purpose, recovery day.',
  'New personal best on the last kilometre.',
  'Windy along the water.',
  'Ran with the club group.',
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// A local part built from the person's own name, so the seeded accounts look
// like accounts rather than like fixtures. NFD splits an accented letter
// into its base plus a combining mark, and the [^a-z] filter then drops the
// mark along with everything else that is not a plain ASCII letter - so the
// address survives a case-insensitive unique index and being typed by hand
// mid-demo.
function emailLocalPart(firstName: string, lastName: string): string {
  const fold = (value: string): string =>
    value
      .normalize('NFD')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
  return `${fold(firstName)}.${fold(lastName)}`;
}

// How many days of the current week are already behind us, today included.
// The current week must carry runs or the global weekly leaderboard renders
// empty and AC1 fails on the very screen the ticket exists for; it must also
// carry no FUTURE days, because a run dated tomorrow is one the API itself
// would refuse to accept.
function daysElapsedThisWeek(today: string): number {
  const monday = mondayOf(today);
  let elapsed = 1;
  while (addDaysIso(monday, elapsed - 1) < today) elapsed += 1;
  return elapsed;
}

function buildRun(
  faker: Faker,
  profile: LevelProfile,
  date: string,
  isLongRun: boolean,
): DemoRun {
  const [minKm, maxKm] = isLongRun
    ? profile.longDistanceKm
    : profile.easyDistanceKm;
  const distanceKm = clamp(
    faker.number.float({ min: minKm, max: maxKm, fractionDigits: 1 }),
    0.5,
    DEMO_RUN_BOUNDS.maxDistanceKm,
  );

  // Long runs are run slower than everything else, which is both true of
  // real training and the thing that keeps the longest distances furthest
  // from the fast-pace threshold.
  const paceSecPerKm = clamp(
    faker.number.int({
      min: profile.paceSecPerKm[0],
      max: profile.paceSecPerKm[1],
    }) + (isLongRun ? 25 : 0),
    DEMO_RUN_BOUNDS.fastestPaceSecPerKm,
    DEMO_RUN_BOUNDS.slowestPaceSecPerKm,
  );

  return {
    routeName: faker.helpers.arrayElement(ROUTE_NAMES),
    distanceKm,
    durationSeconds: Math.round(distanceKm * paceSecPerKm),
    date,
    effort: isLongRun ? 'Hard' : faker.helpers.arrayElement(LIGHT_EFFORTS),
    // Most runs carry no note, exactly like most real ones.
    note: faker.datatype.boolean(0.3)
      ? faker.helpers.arrayElement(RUN_NOTES)
      : '',
  };
}

// One runner's history: 6 to 10 whole Monday-based weeks ending with the
// current, partial one. Weeks are walked oldest first only so the generated
// order reads chronologically; nothing downstream depends on it.
function buildRunHistory(
  faker: Faker,
  profile: LevelProfile,
  today: string,
): DemoRun[] {
  const weeks = faker.number.int({ min: 6, max: 10 });
  const currentMonday = mondayOf(today);
  const elapsed = daysElapsedThisWeek(today);
  const runs: DemoRun[] = [];

  for (let weeksAgo = weeks - 1; weeksAgo >= 0; weeksAgo -= 1) {
    const monday = addDaysIso(currentMonday, -7 * weeksAgo);
    // The current week only offers the days that have already happened, so
    // on a Monday it offers exactly one - and still gets a run, which is
    // what AC1 needs.
    const availableDays = weeksAgo === 0 ? elapsed : 7;
    const wanted = faker.number.int({
      min: profile.runsPerWeek[0],
      max: profile.runsPerWeek[1],
    });
    const offsets = faker.helpers
      .arrayElements(
        Array.from({ length: availableDays }, (_, index) => index),
        Math.min(wanted, availableDays),
      )
      .sort((a, b) => a - b);

    offsets.forEach((offset, index) => {
      // At most one long run a week, and only in weeks with room for it.
      const isLongRun = index === offsets.length - 1 && offsets.length >= 3;
      runs.push(
        buildRun(faker, profile, addDaysIso(monday, offset), isLongRun),
      );
    });
  }

  return runs;
}

function buildUsers(faker: Faker, today: string): DemoUser[] {
  const users: DemoUser[] = [];
  const takenEmails = new Set<string>();

  for (let index = 0; index < DEMO_USER_COUNT; index += 1) {
    const profile = LEVEL_PROFILES[index % LEVEL_PROFILES.length];
    const isPrimary = index === 0;
    const firstName = isPrimary ? 'Ana' : faker.person.firstName();
    const lastName = isPrimary ? 'Demo' : faker.person.lastName();

    let email = isPrimary
      ? DEMO_PRIMARY_EMAIL
      : `${emailLocalPart(firstName, lastName)}@${DEMO_EMAIL_DOMAIN}`;
    // Faker can hand out the same name twice, and User.email is UNIQUE, so
    // the second one gets a number rather than the whole seed failing.
    if (takenEmails.has(email)) {
      email = email.replace('@', `${index}@`);
    }
    takenEmails.add(email);

    const runs = buildRunHistory(faker, profile, today);

    users.push({
      email,
      firstName,
      lastName,
      // Every seeded account opts INTO all three settings, because the
      // schema default is false on all of them and an opted-out account
      // appears on no leaderboard and has no public profile - which would
      // leave every screen this ticket exists to fill exactly as empty as
      // before. The seeder is the intended exception to that default, not a
      // reason to change it (see common/privacy.ts).
      //
      // The one exception is the last account, left at the defaults on
      // purpose: it is what makes the privacy gate demonstrable rather than
      // merely claimed. It joins the event and logs runs like everyone
      // else, and the event board shows it with a withheld rank.
      privacy:
        index === DEMO_USER_COUNT - 1
          ? { ...PRIVACY_DEFAULTS }
          : { profilePublic: true, showOnLeaderboard: true, showRoutes: true },
      runningLevel: profile.level,
      weeklyGoalKm: profile.weeklyGoalKm,
      goalStartDate: runs[0]?.date ?? mondayOf(today),
      runs,
    });
  }

  return users;
}

// A follow web with a shape, not a random scatter: the primary account both
// follows and is followed (so its own Following/Followers tabs and its feed
// have something in them), and everyone else follows one to three others so
// no profile is an island.
function buildFollows(faker: Faker, users: DemoUser[]): DemoFollow[] {
  const edges: DemoFollow[] = [];
  const seen = new Set<string>();

  const add = (followerEmail: string, followeeEmail: string): void => {
    if (followerEmail === followeeEmail) return;
    const key = `${followerEmail}|${followeeEmail}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ followerEmail, followeeEmail });
  };

  const [primary, ...others] = users;
  others.slice(0, 6).forEach((user) => add(primary.email, user.email));
  others.slice(4, 9).forEach((user) => add(user.email, primary.email));

  others.forEach((user) => {
    const targets = faker.helpers.arrayElements(
      users.filter((candidate) => candidate.email !== user.email),
      faker.number.int({ min: 1, max: 3 }),
    );
    targets.forEach((target) => add(user.email, target.email));
  });

  return edges;
}

// Deliberately narrow (the ticket asks for this decision to be made rather
// than defaulted): only the followers of the PRIMARY account produce a
// notification, so the demo bell shows a handful of real, clickable entries
// instead of the several hundred rows that seeding every edge and every
// followed run would produce. A bell with 200 unread is not a demo, it is
// noise. Every other notification type keeps being written by the app
// itself, live, during the demo.
function buildNotifications(
  users: DemoUser[],
  follows: DemoFollow[],
): DemoNotification[] {
  const primaryEmail = users[0].email;
  return follows
    .filter((edge) => edge.followeeEmail === primaryEmail)
    .map((edge) => ({
      userEmail: primaryEmail,
      actorEmail: edge.followerEmail,
    }));
}

// One event whose window CONTAINS today, so its state derives to 'active'
// (events.service deriveEventState) and the events page has something on it.
// The window reaches back far enough that every participant already has runs
// inside it, which is what makes the event leaderboard populated rather than
// a list of zeros.
function buildEvent(users: DemoUser[], today: string): DemoEvent {
  const participants = [
    ...users.slice(0, 8),
    // The private account joins too, so the event board demonstrates a
    // participant whose rank and distance are withheld.
    users[DEMO_USER_COUNT - 1],
  ];
  const startDate = addDaysIso(today, -10);
  const endDate = addDaysIso(today, 11);

  // Derived from what these participants actually run, exactly like the
  // window is derived from today, rather than being a round number picked in
  // advance. A fixed target ages badly in one direction only: this group
  // logs ~700 km in the ten days before the seed, so any number small enough
  // to look like a challenge has already been passed before the demo opens,
  // which makes it the one figure on the page that contradicts the data
  // under it. Scaling the pace so far by the days remaining puts the target
  // ahead of the group with the event still worth finishing.
  const kmSoFar = participants.reduce(
    (total, user) =>
      total +
      user.runs
        .filter((run) => run.date >= startDate && run.date <= endDate)
        .reduce((sum, run) => sum + run.distanceKm, 0),
    0,
  );
  const elapsedDays = 11; // startDate through today, inclusive
  const wholeWindowDays = 22;
  const projected = (kmSoFar / elapsedDays) * wholeWindowDays;
  // Rounded to a talkable number, and always ahead of the projection.
  const targetKm = Math.ceil((projected * 1.1) / 100) * 100;

  return {
    // Season-neutral on purpose: the window is derived from whatever day the
    // seeder runs on, so "Spring Challenge" would be wrong most of the year.
    name: 'Decode Community Challenge',
    description:
      'Three weeks, one collective target. Every kilometre logged inside the window counts.',
    startDate,
    endDate,
    targetKm,
    ownerEmail: users[0].email,
    participantEmails: participants.map((user) => user.email),
  };
}

export interface BuildDemoDatasetOptions {
  // The calendar day the history is generated backwards from. Injectable so
  // the spec is not a different test on a Monday than on a Sunday.
  today?: string;
  seed?: number;
}

export function buildDemoDataset(
  options: BuildDemoDatasetOptions = {},
): DemoDataset {
  const today = options.today ?? utcTodayIso();
  const faker = new Faker({ locale: en });
  faker.seed(options.seed ?? DEMO_FAKER_SEED);

  const users = buildUsers(faker, today);
  const follows = buildFollows(faker, users);

  return {
    users,
    follows,
    notifications: buildNotifications(users, follows),
    event: buildEvent(users, today),
  };
}
