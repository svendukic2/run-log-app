import { randomBytes } from 'node:crypto';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Sprint 1 acceptance tests, updated for the auth flows RUN-58 introduced:
 * the v1 Welcome form is gone, Sign up collects names/email (plus the
 * password that makes it a real account) and the setup steps run after
 * signup. One describe block per Jira task where the v1 flow survives
 * (RUN-9..15, RUN-23); the RUN-58 block covers the sign in / sign up /
 * sign out criteria that replaced the Welcome screen (RUN-7/8).
 *
 * Database-backed since RUN-51: isolation is per ACCOUNT, not per database
 * wipe - every test signs up its own unique account, and every /api
 * endpoint is scoped to the Bearer token's user.
 */

const PROFILE = { firstName: 'Marko', lastName: 'Kovač', email: 'marko@email.com' };
const PASSWORD = 'correct-horse-battery';

const SESSION_KEY = 'runlog.session';
const DRAFT_KEY = 'runlog.onboardingDraft';

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// Unique per call: tests run fullyParallel and signup 409s on a reused
// email, so every walk through the signup form mints its own address.
function uniqueEmail(): string {
  return `runner-${randomBytes(8).toString('hex')}@example.com`;
}

interface SeededAccount {
  token: string;
  email: string;
  authHeaders: { Authorization: string };
}

// Fast-path for tests that need an onboarded user without walking the flow:
// creates a REAL account through the API (signup, then the same goal and
// profile PUTs "Finish setup" makes) and plants its session (token + email,
// RUN-58) in localStorage before the page loads.
async function seedOnboardedUser(page: Page, request: APIRequestContext): Promise<SeededAccount> {
  const email = uniqueEmail();
  const signup = await request.post('/api/auth/signup', {
    data: { email, password: PASSWORD, firstName: PROFILE.firstName, lastName: PROFILE.lastName },
  });
  expect(signup.ok(), 'signup must succeed').toBeTruthy();
  const { token } = (await signup.json()) as { token: string };
  const authHeaders = { Authorization: `Bearer ${token}` };

  const goal = await request.put('/api/goal', {
    headers: authHeaders,
    data: { km: 20, startDate: todayIso(), endDate: null },
  });
  expect(goal.ok(), 'goal seed must succeed').toBeTruthy();
  const profile = await request.put('/api/profile', {
    headers: authHeaders,
    data: { runningLevel: 'Beginner', defaultWeeklyGoalKm: 20 },
  });
  expect(profile.ok(), 'profile seed must succeed').toBeTruthy();

  await page.addInitScript(
    ({ key, session }) => {
      window.localStorage.setItem(key, JSON.stringify(session));
    },
    { key: SESSION_KEY, session: { email, token } },
  );
  return { token, email, authHeaders };
}

async function readDraft(page: Page): Promise<{ profile?: unknown; goal?: unknown } | null> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), DRAFT_KEY);
  return raw ? (JSON.parse(raw) as { profile?: unknown; goal?: unknown }) : null;
}

// This account's runs, straight from the API - the truth the UI renders.
async function runsOf(request: APIRequestContext, account: SeededAccount): Promise<unknown[]> {
  const response = await request.get('/api/runs', { headers: account.authHeaders });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as unknown[];
}

// Walks the Sign up form; the caller is on /signup afterwards' next stop,
// the goal setup step.
async function signUpThroughForm(page: Page, email: string): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel('First name').fill(PROFILE.firstName);
  await page.getByLabel('Last name').fill(PROFILE.lastName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /Create account/ }).click();
  await expect(page).toHaveURL(/\/setup\/goal$/);
}

/* RUN-58 - Sign in, Sign up and session handling ------------------------------ */

test.describe('RUN-58 Auth screens and session', () => {
  test('an unauthenticated visitor lands on Sign in from any app route (AC1)', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/signin$/);
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();

    await page.goto('/');
    await expect(page).toHaveURL(/\/signin$/);
    // The retired v1 promise stays retired.
    await expect(page.getByText(/No password needed/)).toHaveCount(0);
  });

  test('signup continues straight into the setup steps (AC2)', async ({ page }) => {
    await signUpThroughForm(page, uniqueEmail());
    await expect(page.getByText('Step 1 of 2')).toBeVisible();
    await expect(page.getByText(`Welcome, ${PROFILE.firstName}`)).toBeVisible();
  });

  test('valid credentials land on the Dashboard with data loaded (AC3)', async ({
    page,
    request,
  }) => {
    // The account exists (seeded through the API), but THIS browser context
    // is signed out: the session is never planted.
    const email = uniqueEmail();
    const signup = await request.post('/api/auth/signup', {
      data: { email, password: PASSWORD, firstName: PROFILE.firstName, lastName: PROFILE.lastName },
    });
    const { token } = (await signup.json()) as { token: string };
    await request.put('/api/goal', {
      headers: { Authorization: `Bearer ${token}` },
      data: { km: 20, startDate: todayIso(), endDate: null },
    });
    await request.put('/api/profile', {
      headers: { Authorization: `Bearer ${token}` },
      data: { runningLevel: 'Beginner', defaultWeeklyGoalKm: 20 },
    });

    await page.goto('/signin');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('wrong credentials show one vague inline error (AC4)', async ({ page }) => {
    await page.goto('/signin');
    await page.getByLabel('Email').fill(uniqueEmail());
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    // Scoped by text, not the bare alert role: Next's route announcer is
    // also role="alert".
    await expect(page.getByText('Wrong email or password.')).toBeVisible();
    await expect(page).toHaveURL(/\/signin$/);
  });

  test('sign out from the sidebar footer clears the session and lands on Sign in (AC5)', async ({
    page,
    request,
  }) => {
    // Signs in through the real UI instead of seedOnboardedUser: that
    // helper plants the session with an init script which would re-plant it
    // on every navigation, including the one sign-out performs.
    const email = uniqueEmail();
    const signup = await request.post('/api/auth/signup', {
      data: { email, password: PASSWORD, firstName: PROFILE.firstName, lastName: PROFILE.lastName },
    });
    const { token } = (await signup.json()) as { token: string };
    await request.put('/api/goal', {
      headers: { Authorization: `Bearer ${token}` },
      data: { km: 20, startDate: todayIso(), endDate: null },
    });
    await request.put('/api/profile', {
      headers: { Authorization: `Bearer ${token}` },
      data: { runningLevel: 'Beginner', defaultWeeklyGoalKm: 20 },
    });
    await page.goto('/signin');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/signin$/);
    const session = await page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY);
    expect(session).toBeNull();

    // The guard holds after the sign-out too.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/signin$/);
  });

  test('a deep link into a guarded route stays on that route when signed in', async ({
    page,
    request,
  }) => {
    // Regression guard: the guard used to decide on its hydration snapshot,
    // where the session is invisible, so every full page load of a guarded
    // route bounced through Sign in and ended up on the Dashboard.
    await seedOnboardedUser(page, request);
    for (const route of ['/settings', '/runs', '/coach']) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`${route}$`));
    }
    await expect(page.getByRole('heading', { name: 'AI Coach', level: 1 })).toBeVisible();
  });

  test('an invalid token signs out cleanly instead of showing broken screens (AC6)', async ({
    page,
    request,
  }) => {
    const account = await seedOnboardedUser(page, request);
    // Corrupt the stored token: the first API call 401s.
    await page.addInitScript(
      ({ key, session }) => {
        window.localStorage.setItem(key, JSON.stringify(session));
      },
      { key: SESSION_KEY, session: { email: account.email, token: 'expired-nonsense' } },
    );
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/signin$/);
  });
});

/* RUN-9 - Weekly goal value control (GOAL-1, GOAL-2) ------------------------- */

test.describe('RUN-9 Weekly goal value control', () => {
  test.beforeEach(async ({ page }) => {
    await signUpThroughForm(page, uniqueEmail());
  });

  test('shows step indicator, badge and heading with default 20 km / week', async ({ page }) => {
    await expect(page.getByText('Step 1 of 2')).toBeVisible();
    await expect(page.getByText(`Welcome, ${PROFILE.firstName}`)).toBeVisible();
    await expect(page.getByRole('heading', { name: /How far do you want/ })).toBeVisible();
    await expect(page.getByText('20', { exact: true })).toBeVisible();
    await expect(page.getByText('km / week')).toBeVisible();
  });

  test('stepper buttons and slider edit the same value', async ({ page }) => {
    const slider = page.getByRole('slider', { name: 'Weekly goal in kilometres' });
    await page.getByRole('button', { name: 'Increase weekly goal' }).click();
    await expect(page.getByText('21', { exact: true })).toBeVisible();
    await expect(slider).toHaveValue('21');

    await page.getByRole('button', { name: 'Decrease weekly goal' }).click();
    await page.getByRole('button', { name: 'Decrease weekly goal' }).click();
    await expect(page.getByText('19', { exact: true })).toBeVisible();
    await expect(slider).toHaveValue('19');

    // Moving the slider updates the readout the stepper edits.
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('20', { exact: true })).toBeVisible();
  });

  test('value is clamped to the 0-60 slider range', async ({ page }) => {
    const slider = page.getByRole('slider', { name: 'Weekly goal in kilometres' });
    await slider.focus();
    await page.keyboard.press('End'); // range input jumps to max
    await expect(slider).toHaveValue('60');
    await page.getByRole('button', { name: 'Increase weekly goal' }).click();
    await expect(slider).toHaveValue('60');

    await slider.focus(); // clicking the stepper moved focus to the button
    await page.keyboard.press('Home'); // and to min
    await expect(slider).toHaveValue('0');
    await page.getByRole('button', { name: 'Decrease weekly goal' }).click();
    await expect(slider).toHaveValue('0');
  });
});

/* RUN-10 - Goal dates and setup step navigation (GOAL-3..6, A2, A3) ---------- */

test.describe('RUN-10 Goal dates and navigation', () => {
  test.beforeEach(async ({ page }) => {
    await signUpThroughForm(page, uniqueEmail());
  });

  test('start date is prefilled with today, end date is optional', async ({ page }) => {
    await expect(page.locator('#start-date')).toHaveValue(todayIso());
    await expect(page.locator('#end-date')).toHaveValue('');
    await expect(page.getByText('No end date')).toBeVisible();
  });

  test('end date before start date shows an inline error and does not save (A3)', async ({
    page,
  }) => {
    await page.locator('#end-date').fill('2020-01-01');
    await page.getByRole('button', { name: /Start tracking/ }).click();
    await expect(page.getByText('End date must be on or after the start date')).toBeVisible();
    await expect(page).toHaveURL(/\/setup\/goal$/);
    const draft = await readDraft(page);
    expect(draft?.goal).toBeUndefined();
  });

  test('"Start tracking" saves the draft goal and opens Setup - Running level', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Increase weekly goal' }).click();
    await page.getByRole('button', { name: /Start tracking/ }).click();
    await expect(page).toHaveURL(/\/setup\/level$/);
    const draft = await readDraft(page);
    expect(draft?.goal).toMatchObject({ km: 21, endDate: null });
  });

  test('"Skip for now" continues with the default 20 km (A2)', async ({ page }) => {
    await page.getByRole('button', { name: 'Increase weekly goal' }).click();
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page).toHaveURL(/\/setup\/level$/);
    const draft = await readDraft(page);
    expect(draft?.goal).toMatchObject({ km: 20, endDate: null });
  });
});

/* RUN-11 - Running level selection (LVL-1..4, A4) ---------------------------- */

test.describe('RUN-11 Running level step', () => {
  test.beforeEach(async ({ page }) => {
    await signUpThroughForm(page, uniqueEmail());
    await page.getByRole('button', { name: /Start tracking/ }).click();
    await expect(page).toHaveURL(/\/setup\/level$/);
  });

  test('shows step indicator, badge and the three options with Beginner preselected', async ({
    page,
  }) => {
    await expect(page.getByText('Step 2 of 2')).toBeVisible();
    await expect(page.getByText('Last step')).toBeVisible();
    await expect(page.getByRole('heading', { name: /running level/ })).toBeVisible();
    await expect(page.getByText('New to running or getting back into it')).toBeVisible();
    await expect(page.getByText('Run regularly, comfortable with 5-10K')).toBeVisible();
    await expect(page.getByText('Training consistently, chasing new PRs')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Beginner' })).toBeChecked();
  });

  test('selecting one level deselects the previous one', async ({ page }) => {
    await page.getByText('Training consistently, chasing new PRs').click();
    await expect(page.getByRole('radio', { name: 'Advanced' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Beginner' })).not.toBeChecked();
  });

  test('"Back" returns to step 02 with entered values kept (A4)', async ({ page }) => {
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/setup\/goal$/);
    // The draft goal saved before leaving step 02 refills the control.
    const slider = page.getByRole('slider', { name: 'Weekly goal in kilometres' });
    await expect(slider).toHaveValue('20');
    await expect(page.getByText(`Welcome, ${PROFILE.firstName}`)).toBeVisible();
  });

  test('"Finish setup" creates the profile server-side and opens the Dashboard', async ({
    page,
  }) => {
    await page.getByText('Run regularly, comfortable with 5-10K').click();
    await page.getByRole('button', { name: /Finish setup/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // "Onboarding complete" IS the profile existing server-side (RUN-50):
    // prove it through the API with the session signup minted.
    const raw = await page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY);
    const session = JSON.parse(raw ?? 'null') as { token: string } | null;
    expect(session?.token).toBeTruthy();
    const response = await page.request.get('/api/profile', {
      headers: { Authorization: `Bearer ${session!.token}` },
    });
    expect(response.ok()).toBeTruthy();
    // The profile holds the SETUP ANSWERS since RUN-59; the identity lives
    // on the account, which signup already filled.
    expect((await response.json()) as { runningLevel: string }).toEqual({
      runningLevel: 'Intermediate',
      defaultWeeklyGoalKm: 20,
    });
    const account = await page.request.get('/api/account', {
      headers: { Authorization: `Bearer ${session!.token}` },
    });
    expect((await account.json()) as { firstName: string }).toMatchObject({
      firstName: PROFILE.firstName,
      lastName: PROFILE.lastName,
    });
  });
});

/* RUN-59 - Setup runs after signup, from server state ------------------------ */

test.describe('RUN-59 Onboarding after signup', () => {
  test('setup resumes on another device, greeting the runner by name (AC3)', async ({
    page,
    request,
  }) => {
    // An account that signed up and abandoned setup: a User row, no profile.
    const email = uniqueEmail();
    const signup = await request.post('/api/auth/signup', {
      data: { email, password: PASSWORD, firstName: 'Ivana', lastName: 'Novak' },
    });
    expect(signup.ok()).toBeTruthy();

    // A DIFFERENT browser context (this test's own, with empty storage): no
    // wizard draft, no local identity - everything must come from the server.
    await page.goto('/signin');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /^Sign in$/ }).click();

    // Straight into the unfinished setup, greeted from the account (AC3/AC4).
    await expect(page).toHaveURL(/\/setup\/goal$/);
    await expect(page.getByText('Welcome, Ivana')).toBeVisible();

    // And it can be finished here, which is what "resumes" has to mean.
    await page.getByRole('button', { name: /Start tracking/ }).click();
    await page.getByRole('button', { name: /Finish setup/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('Ivana N.')).toBeVisible();
  });

  test('a completed account signing in on a fresh device lands on the Dashboard (AC2)', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail();
    const signup = await request.post('/api/auth/signup', {
      data: { email, password: PASSWORD, firstName: PROFILE.firstName, lastName: PROFILE.lastName },
    });
    const { token } = (await signup.json()) as { token: string };
    await request.put('/api/goal', {
      headers: { Authorization: `Bearer ${token}` },
      data: { km: 20, startDate: todayIso(), endDate: null },
    });
    await request.put('/api/profile', {
      headers: { Authorization: `Bearer ${token}` },
      data: { runningLevel: 'Beginner', defaultWeeklyGoalKm: 20 },
    });

    await page.goto('/signin');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /^Sign in$/ }).click();

    // Server state, not a device flag: this browser has never seen the
    // account before.
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('the greeting and sidebar footer read the account, and a rename shows in both (AC4)', async ({
    page,
    request,
  }) => {
    const account = await seedOnboardedUser(page, request);
    await page.goto('/settings');

    await expect(page.getByText(`${PROFILE.firstName} K.`)).toBeVisible();
    await expect(page.getByText(account.email)).toBeVisible();

    await page.getByLabel('First name').fill('Renamed');
    await page.getByRole('button', { name: /Save changes/ }).click();

    // The sidebar footer follows the account record, not a stale copy.
    await expect(page.getByText('Renamed K.')).toBeVisible();
    // And so does the dashboard greeting, on the next visit.
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByText(/Good (morning|afternoon|evening), Renamed/)).toBeVisible();
  });
});

/* RUN-12 / RUN-13 - Sidebar navigation and routing (DSH-1) ------------------- */

test.describe('RUN-12/13 App shell and routing', () => {
  test('sidebar shows all sections and items on the dashboard', async ({ page, request }) => {
    await seedOnboardedUser(page, request);
    await page.goto('/dashboard');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();
    for (const section of ['MENU', 'ASSISTANT', 'ACCOUNT']) {
      await expect(nav.getByText(section)).toBeVisible();
    }
    for (const item of ['Dashboard', 'Runs', 'AI Coach', 'Settings']) {
      await expect(nav.getByRole('link', { name: item })).toBeVisible();
    }
  });

  test('clicking a nav item opens its view and marks it active', async ({ page, request }) => {
    await seedOnboardedUser(page, request);
    await page.goto('/dashboard');
    const nav = page.getByRole('navigation', { name: 'Main' });

    const routes: Array<[string, RegExp]> = [
      ['Runs', /\/runs$/],
      ['AI Coach', /\/coach$/],
      ['Settings', /\/settings$/],
      ['Dashboard', /\/dashboard$/],
    ];
    for (const [item, url] of routes) {
      await nav.getByRole('link', { name: item }).click();
      await expect(page).toHaveURL(url);
      await expect(nav.getByRole('link', { name: item })).toHaveAttribute('aria-current', 'page');
    }
  });

  test('auth and setup screens render without the sidebar', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  });

  test('an onboarded user opening "/" lands on the dashboard', async ({ page, request }) => {
    await seedOnboardedUser(page, request);
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

/* RUN-15 - Dashboard page header (DSH-2) ------------------------------------- */

test.describe('RUN-15 Dashboard header', () => {
  test('shows the Dashboard title and an Add run button that opens the modal', async ({
    page,
    request,
  }) => {
    await seedOnboardedUser(page, request);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await page.getByRole('button', { name: /Add run/ }).click();
    await expect(page.getByRole('dialog', { name: 'Add run' })).toBeVisible();
  });
});

/* RUN-23 - Add run modal with validation (ADD-1..8, A12) --------------------- */

test.describe('RUN-23 Add run modal', () => {
  let account: SeededAccount;

  test.beforeEach(async ({ page, request }) => {
    account = await seedOnboardedUser(page, request);
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Add run/ }).click();
    await expect(page.getByRole('dialog', { name: 'Add run' })).toBeVisible();
  });

  test('opens with all fields, designed placeholders, today as date and Medium effort', async ({
    page,
  }) => {
    const dialog = page.getByRole('dialog', { name: 'Add run' });
    await expect(dialog.getByPlaceholder('e.g. Evening tempo')).toBeVisible();
    await expect(dialog.getByPlaceholder('0.0')).toBeVisible();
    await expect(dialog.getByPlaceholder('00:00')).toBeVisible();
    await expect(dialog.locator('#run-date')).toHaveValue(todayIso());
    await expect(dialog.getByText('Easy')).toBeVisible();
    await expect(dialog.getByText('Medium')).toBeVisible();
    await expect(dialog.getByText('Hard')).toBeVisible();
    await expect(dialog.getByText('Note (optional)')).toBeVisible();
  });

  test('Cancel and Escape close without saving', async ({ page, request }) => {
    const dialog = page.getByRole('dialog', { name: 'Add run' });
    await dialog.getByPlaceholder('e.g. Evening tempo').fill('Morning loop');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await runsOf(request, account)).toHaveLength(0);

    await page.getByRole('button', { name: /Add run/ }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Add run' })).toHaveCount(0);
    expect(await runsOf(request, account)).toHaveLength(0);
  });

  test('invalid values show inline messages and nothing is saved (ADD-5..7)', async ({
    page,
    request,
  }) => {
    const dialog = page.getByRole('dialog', { name: 'Add run' });
    // Validation runs on Next since RUN-54: the save lives on the route step.
    await dialog.getByRole('button', { name: /^Next$/ }).click();
    await expect(dialog.getByText('Route name is required')).toBeVisible();
    await expect(dialog.getByText('Distance is required')).toBeVisible();
    await expect(dialog.getByText('Duration is required')).toBeVisible();

    await dialog.getByPlaceholder('e.g. Evening tempo').fill('Morning loop');
    await dialog.getByPlaceholder('0.0').fill('0');
    await dialog.getByPlaceholder('00:00').fill('42:75');
    // Validation runs on Next since RUN-54: the save lives on the route step.
    await dialog.getByRole('button', { name: /^Next$/ }).click();
    await expect(dialog.getByText('Enter a distance greater than 0')).toBeVisible();
    await expect(dialog.getByText('Enter a duration as mm:ss or h:mm:ss')).toBeVisible();

    await expect(dialog).toBeVisible();
    expect(await runsOf(request, account)).toHaveLength(0);
  });

  test('rejects a run dated in the future (RUN-23 AC7)', async ({ page, request }) => {
    const dialog = page.getByRole('dialog', { name: 'Add run' });
    await dialog.getByPlaceholder('e.g. Evening tempo').fill('Time travel');
    await dialog.getByPlaceholder('0.0').fill('5');
    await dialog.getByPlaceholder('00:00').fill('30:00');
    await dialog.locator('#run-date').fill('2999-01-01');
    // Validation runs on Next since RUN-54: the save lives on the route step.
    await dialog.getByRole('button', { name: /^Next$/ }).click();
    await expect(dialog.getByText('Date cannot be in the future')).toBeVisible();
    expect(await runsOf(request, account)).toHaveLength(0);
  });

  test('a valid run is saved with derived pace inputs and Medium as default effort', async ({
    page,
    request,
  }) => {
    const dialog = page.getByRole('dialog', { name: 'Add run' });
    await dialog.getByPlaceholder('e.g. Evening tempo').fill('Morning loop');
    await dialog.getByPlaceholder('0.0').fill('8.2');
    await dialog.getByPlaceholder('00:00').fill('42:15');
    // Two steps since RUN-54. Nothing is placed on the map, so this is also
    // the AC3 path: a run saved with no route at all.
    await dialog.getByRole('button', { name: /^Next$/ }).click();
    await dialog.getByRole('button', { name: /Save run/ }).click();
    await expect(dialog).toHaveCount(0);

    const runs = await runsOf(request, account);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      routeName: 'Morning loop',
      distanceKm: 8.2,
      durationSeconds: 42 * 60 + 15,
      date: todayIso(),
      effort: 'Medium', // preselected default (ADD-8)
    });
  });

  test('accepts the h:mm:ss duration shape (ADD-6)', async ({ page, request }) => {
    const dialog = page.getByRole('dialog', { name: 'Add run' });
    await dialog.getByPlaceholder('e.g. Evening tempo').fill('Long run');
    await dialog.getByPlaceholder('0.0').fill('14.2');
    await dialog.getByPlaceholder('00:00').fill('1:18:44');
    // Two steps since RUN-54. Nothing is placed on the map, so this is also
    // the AC3 path: a run saved with no route at all.
    await dialog.getByRole('button', { name: /^Next$/ }).click();
    await dialog.getByRole('button', { name: /Save run/ }).click();
    await expect(dialog).toHaveCount(0);

    const runs = (await runsOf(request, account)) as Array<{ durationSeconds: number }>;
    expect(runs[0].durationSeconds).toBe(1 * 3600 + 18 * 60 + 44);
  });
});

/* Sprint goal - the full journey end to end ---------------------------------- */

test('sprint goal: a new user signs up, onboards, logs a run, and it survives a reload', async ({
  page,
}) => {
  await signUpThroughForm(page, uniqueEmail());
  await page.getByRole('button', { name: 'Increase weekly goal' }).click();
  await page.getByRole('button', { name: /Start tracking/ }).click();
  await page.getByText('Run regularly, comfortable with 5-10K').click();
  await page.getByRole('button', { name: /Finish setup/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole('button', { name: /Add run/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Add run' });
  await dialog.getByPlaceholder('e.g. Evening tempo').fill('River trail');
  await dialog.getByPlaceholder('0.0').fill('5.4');
  await dialog.getByPlaceholder('00:00').fill('28:40');
  // Two steps since RUN-54. Nothing is placed on the map, so this is also
  // the AC3 path: a run saved with no route at all.
  await dialog.getByRole('button', { name: /^Next$/ }).click();
  await dialog.getByRole('button', { name: /Save run/ }).click();
  await expect(dialog).toHaveCount(0);

  // Everything survives a reload BECAUSE it lives server-side: the session
  // re-authenticates, the profile keeps onboarding "complete" and the run
  // comes back from the API.
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole('region', { name: 'Recent runs' }).getByText('River trail'),
  ).toBeVisible();
});
