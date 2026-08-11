import { randomBytes } from 'node:crypto';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Sprint 1 acceptance tests. One describe block per Jira task, one test per
 * acceptance criterion (or a tight group of them). Sprint goal under test:
 * "a new user completes onboarding and logs their first run."
 *
 * Covers RUN-7, RUN-8, RUN-9, RUN-10, RUN-11, RUN-12, RUN-13, RUN-15, RUN-23.
 *
 * Database-backed since RUN-51: the app persists through the API (RUN-48/50),
 * so the backend and PostgreSQL must run - localStorage now holds only the
 * device session (`runlog.session`) and the wizard's local draft
 * (`runlog.onboardingDraft`). Isolation is per ACCOUNT, not per database
 * wipe: every fresh browser context mints its own device account on first
 * server contact, and every API endpoint is scoped to the Bearer token's
 * user, so tests cannot see each other's rows by construction.
 */

const PROFILE = { firstName: 'Marko', lastName: 'Kovač', email: 'marko@email.com' };

const SESSION_KEY = 'runlog.session';
const DRAFT_KEY = 'runlog.onboardingDraft';

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// The same credential shape frontend/src/lib/session.ts mints: unique by
// construction on the reserved @device.runlog domain, so signup never 409s.
function mintCredentials(): { email: string; password: string } {
  return {
    email: `runner-${randomBytes(8).toString('hex')}@device.runlog`,
    password: randomBytes(24).toString('hex'),
  };
}

interface SeededAccount {
  token: string;
  authHeaders: { Authorization: string };
}

// Fast-path for tests that need an onboarded user without walking the flow:
// creates a REAL account through the API (signup, then the same goal and
// profile PUTs "Finish setup" makes) and plants its session in localStorage
// before the page loads. The API calls go through the frontend's /api proxy,
// exactly like the app's own requests.
async function seedOnboardedUser(page: Page, request: APIRequestContext): Promise<SeededAccount> {
  const credentials = mintCredentials();
  const signup = await request.post('/api/auth/signup', {
    data: { ...credentials, firstName: PROFILE.firstName, lastName: PROFILE.lastName },
  });
  expect(signup.ok(), 'device-account signup must succeed').toBeTruthy();
  const { token } = (await signup.json()) as { token: string };
  const authHeaders = { Authorization: `Bearer ${token}` };

  const goal = await request.put('/api/goal', {
    headers: authHeaders,
    data: { km: 20, startDate: todayIso(), endDate: null },
  });
  expect(goal.ok(), 'goal seed must succeed').toBeTruthy();
  const profile = await request.put('/api/profile', {
    headers: authHeaders,
    data: { ...PROFILE, runningLevel: 'Beginner', defaultWeeklyGoalKm: 20 },
  });
  expect(profile.ok(), 'profile seed must succeed').toBeTruthy();

  await page.addInitScript(
    ({ key, session }) => {
      window.localStorage.setItem(key, JSON.stringify(session));
    },
    { key: SESSION_KEY, session: { ...credentials, token } },
  );
  return { token, authHeaders };
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

async function fillWelcomeForm(page: Page): Promise<void> {
  await page.getByLabel('First name').fill(PROFILE.firstName);
  await page.getByLabel('Last name').fill(PROFILE.lastName);
  await page.getByLabel('Email').fill(PROFILE.email);
}

/* RUN-7 - Welcome screen layout and copy (WEL-1, WEL-4) ---------------------- */

test.describe('RUN-7 Welcome screen', () => {
  test('shows badge, heading, intro copy and the no-password caption', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Welcome', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Welcome to Run Log' })).toBeVisible();
    await expect(page.getByText('Track every run, hit your weekly goals')).toBeVisible();
    await expect(page.getByText(/No password needed/)).toBeVisible();
  });

  test('has no password field anywhere (WEL-4)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to Run Log' })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test('an onboarded user never sees Welcome again', async ({ page, request }) => {
    await seedOnboardedUser(page, request);
    await page.goto('/');
    // "Onboarded" is derived from the profile existing server-side (RUN-50),
    // so this proves the landing route reads the API, not a local flag.
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

/* RUN-8 - Welcome profile form with validation (WEL-2, WEL-3, WEL-5, A1) ----- */

test.describe('RUN-8 Welcome profile form', () => {
  test('renders the three inputs with designed placeholders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder('Your first name')).toBeVisible();
    await expect(page.getByPlaceholder('Your last name')).toBeVisible();
    await expect(page.getByPlaceholder('you@email.com')).toBeVisible();
  });

  test('empty first name blocks navigation with an inline message', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Last name').fill(PROFILE.lastName);
    await page.getByLabel('Email').fill(PROFILE.email);
    await page.getByRole('button', { name: /Get started/ }).click();
    await expect(page.getByText('First name is required')).toBeVisible();
    await expect(page).toHaveURL('/');
  });

  test('invalid email blocks navigation with an inline message', async ({ page }) => {
    await page.goto('/');
    await fillWelcomeForm(page);
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByRole('button', { name: /Get started/ }).click();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await expect(page).toHaveURL('/');
  });

  test('valid data stores the wizard draft and opens Setup - Weekly goal', async ({ page }) => {
    await page.goto('/');
    await fillWelcomeForm(page);
    await page.getByRole('button', { name: /Get started/ }).click();
    await expect(page).toHaveURL(/\/setup\/goal$/);
    // The badge greets by first name (GOAL-1 / RUN-8 AC5).
    await expect(page.getByText(`Welcome, ${PROFILE.firstName}`)).toBeVisible();
    // No account exists yet: the answers live in the local wizard draft
    // until "Finish setup" (RUN-50).
    const draft = await readDraft(page);
    expect(draft?.profile).toMatchObject(PROFILE);
  });
});

/* RUN-9 - Weekly goal value control (GOAL-1, GOAL-2) ------------------------- */

test.describe('RUN-9 Weekly goal value control', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await fillWelcomeForm(page);
    await page.getByRole('button', { name: /Get started/ }).click();
    await expect(page).toHaveURL(/\/setup\/goal$/);
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
    await page.goto('/');
    await fillWelcomeForm(page);
    await page.getByRole('button', { name: /Get started/ }).click();
    await expect(page).toHaveURL(/\/setup\/goal$/);
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
    await page.goto('/');
    await fillWelcomeForm(page);
    await page.getByRole('button', { name: /Get started/ }).click();
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

  test('"Finish setup" creates the account server-side and opens the Dashboard', async ({
    page,
  }) => {
    await page.getByText('Run regularly, comfortable with 5-10K').click();
    await page.getByRole('button', { name: /Finish setup/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // "Onboarding complete" IS the profile existing server-side (RUN-50):
    // prove it through the API with the session the finish just minted.
    const raw = await page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY);
    const session = JSON.parse(raw ?? 'null') as { token: string } | null;
    expect(session?.token).toBeTruthy();
    const response = await page.request.get('/api/profile', {
      headers: { Authorization: `Bearer ${session!.token}` },
    });
    expect(response.ok()).toBeTruthy();
    expect((await response.json()) as { runningLevel: string }).toMatchObject({
      ...PROFILE,
      runningLevel: 'Intermediate',
    });
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

  test('onboarding screens render without the sidebar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to Run Log' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
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
    await dialog.getByRole('button', { name: /Save run/ }).click();
    await expect(dialog.getByText('Route name is required')).toBeVisible();
    await expect(dialog.getByText('Distance is required')).toBeVisible();
    await expect(dialog.getByText('Duration is required')).toBeVisible();

    await dialog.getByPlaceholder('e.g. Evening tempo').fill('Morning loop');
    await dialog.getByPlaceholder('0.0').fill('0');
    await dialog.getByPlaceholder('00:00').fill('42:75');
    await dialog.getByRole('button', { name: /Save run/ }).click();
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
    await dialog.getByRole('button', { name: /Save run/ }).click();
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
    await dialog.getByRole('button', { name: /Save run/ }).click();
    await expect(dialog).toHaveCount(0);

    const runs = (await runsOf(request, account)) as Array<{ durationSeconds: number }>;
    expect(runs[0].durationSeconds).toBe(1 * 3600 + 18 * 60 + 44);
  });
});

/* Sprint goal - the full journey end to end ---------------------------------- */

test('sprint goal: a new user onboards and logs their first run, and it survives a reload', async ({
  page,
}) => {
  await page.goto('/');
  await fillWelcomeForm(page);
  await page.getByRole('button', { name: /Get started/ }).click();
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
  await dialog.getByRole('button', { name: /Save run/ }).click();
  await expect(dialog).toHaveCount(0);

  // Everything survives a reload BECAUSE it lives server-side now: the
  // session re-authenticates, the profile keeps onboarding "complete" and
  // the run comes back from the API.
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('region', { name: 'Recent runs' }).getByText('River trail')).toBeVisible();
});
