'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ACCENT_PILL_CLASSES } from '@/components/accentPill';
import TextField from '@/components/TextField';
import { accountInitials, saveAccountDetails, useAccount, type AccountRecord } from '@/lib/account';
import { clampGoal, GOAL_DEFAULT_KM, GOAL_MAX_KM, GOAL_MIN_KM } from '@/lib/goal';
import { saveWeeklyDefault, useProfile } from '@/lib/onboarding';
import { validateProfileForm, type ProfileFormErrors } from '@/lib/profileValidation';
import { ROUTES } from '@/lib/routes';
import { ApiError } from '@/lib/session';
import { useHydrated } from '@/lib/useHydrated';

// Card shell shared by the two settings cards, matching the dashboard cards
// (RUN-17). RUN-37 filled the Profile card; RUN-38 fills Training with the
// default-weekly-goal stepper.
function SettingsCard({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section
      aria-label={title}
      className="rounded-[18px] border border-line bg-white px-5 py-5 sm:px-[28px] sm:py-[26px]"
    >
      <h2 className="font-display text-[17px] font-bold tracking-[-0.2px] text-text-primary">
        {title}
      </h2>
      {children}
    </section>
  );
}

// The avatar block of the Profile card (RUN-37 AC1). The initials derive from
// the *stored* account, not from what is typed in the inputs, so they only
// change once a save succeeds (AC4). There is deliberately no upload control:
// the caption is the whole story ("no upload exists", SET-2).
function AvatarBlock({ account }: { account: AccountRecord | null }) {
  return (
    <div data-testid="avatar-block" className="mt-[26px] flex items-center gap-[18px]">
      <div className="flex size-[64px] shrink-0 items-center justify-center rounded-full bg-accent-soft">
        <span className="font-display text-[20px] font-bold text-accent">
          {account ? accountInitials(account) : ''}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-[3px]">
        <p className="text-[15px] font-semibold text-text-primary">Your avatar</p>
        <p className="text-[13.5px] leading-[1.45] text-secondary">
          Your initials are used automatically across Run Log.
        </p>
      </div>
    </div>
  );
}

// A stepper square (minus/plus): the onboarding stepper's buttons at the
// Settings card's smaller scale (Figma node 75:129). Unlike there, a bound
// disables its button: this stepper has no slider next to it, so a silently
// ignored click would be the only feedback.
const STEPPER_BUTTON_CLASSES =
  'flex size-[48px] shrink-0 items-center justify-center rounded-[14px] border border-line-strong bg-white text-[22px] text-ink hover:bg-muted disabled:opacity-40 disabled:hover:bg-white';

// The settings body owns the draft for every card because the page has a
// single "Save changes" button (RUN-36): submit persists the profile (RUN-37)
// and the Training default in one action (RUN-38, RUN-39).
function SettingsForm() {
  // Mounted behind the app-data boundary (RUN-50/59), so both stores have
  // settled and the records are available to seed the draft synchronously -
  // no effect, no controlled-input flicker. Two records, two writes: the
  // name/email are the ACCOUNT's (RUN-59), the weekly default is the
  // profile's.
  const account = useAccount();
  const profile = useProfile();
  const [firstName, setFirstName] = useState(account?.firstName ?? '');
  const [lastName, setLastName] = useState(account?.lastName ?? '');
  const [email, setEmail] = useState(account?.email ?? '');
  // The stepper's draft, like the identity fields: seeded from the stored
  // default and only persisted on Save.
  const [goalKm, setGoalKm] = useState(() => profile?.defaultWeeklyGoalKm ?? GOAL_DEFAULT_KM);
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const nextErrors = validateProfileForm({ firstName, lastName, email });
    setErrors(nextErrors);
    // Invalid drafts only show their inline messages; nothing is persisted
    // (AC3), so reloading would still bring back the last saved values.
    if (Object.keys(nextErrors).length > 0) return;

    const draft: AccountRecord = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
    };
    setSaving(true);
    setSaveError('');

    // Two writes behind one button (RUN-36's single "Save changes"): the
    // identity to /api/account, the weekly default to /api/profile. The
    // identity goes FIRST because it is the one that can be rejected for a
    // reason the user must act on (a 409: that email belongs to another
    // account), so the common failure costs nothing.
    // They are two requests, so a partial result is REACHABLE and must not be
    // narrated as "nothing was saved": the identity is already live in the
    // sidebar and the greeting by the time the second write can fail. Each
    // write therefore reports itself, and the stepper snaps back to the value
    // the server still holds - retrying is safe either way (both PUTs are
    // idempotent full replaces).
    // SET-6 - a changed default leaves the running week's target alone -
    // stays the server's job: it freezes the current week before the new
    // default lands (RUN-49).
    let stored: AccountRecord;
    try {
      stored = await saveAccountDetails(draft);
    } catch (error) {
      setSaveError(
        error instanceof ApiError ? error.message : 'Saving your details failed. Try again.',
      );
      setSaving(false);
      return;
    }
    // The inputs adopt what the server STORED (trimmed names, and an email
    // normalized to lowercase), so the card and the footer never show two
    // spellings of the same value.
    setFirstName(stored.firstName);
    setLastName(stored.lastName);
    setEmail(stored.email);

    try {
      await saveWeeklyDefault(goalKm);
    } catch (error) {
      setSaveError(
        error instanceof ApiError
          ? `Your name and email were saved, but the weekly goal default was not: ${error.message}`
          : 'Your name and email were saved, but the weekly goal default was not. Try again.',
      );
      // Show the number that is actually stored, not the one that failed.
      setGoalKm(profile?.defaultWeeklyGoalKm ?? GOAL_DEFAULT_KM);
    } finally {
      setSaving(false);
    }
  };

  return (
    /* The frame stacks both cards and the button in one 660px column against
       the content's left edge; below `sm` the column spans the viewport
       inside the shared page padding. */
    <form
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
      data-testid="settings-body"
      className="flex max-w-[660px] flex-col gap-5"
    >
      <SettingsCard title="Profile">
        <AvatarBlock account={account} />
        {/* The name fields share a row from `sm` up and stack on a phone
            (responsive addendum); Welcome does the same, just from `md`,
            because its column sits in a wider, sidebar-less page. */}
        <div className="mt-[24px] flex flex-col gap-[18px]">
          <div className="flex flex-col gap-[18px] sm:flex-row sm:gap-4">
            <TextField
              id="first-name"
              label="First name"
              placeholder="Your first name"
              value={firstName}
              onChange={setFirstName}
              error={errors.firstName}
            />
            <TextField
              id="last-name"
              label="Last name"
              placeholder="Your last name"
              value={lastName}
              onChange={setLastName}
              error={errors.lastName}
            />
          </div>
          <TextField
            id="email"
            type="email"
            label="Email"
            placeholder="you@email.com"
            value={email}
            onChange={setEmail}
            error={errors.email}
          />
        </div>
      </SettingsCard>

      <SettingsCard title="Training">
        {/* Label and caption left, stepper right from `sm` up; on a phone the
            stepper drops under the caption (responsive addendum). */}
        <div
          data-testid="default-goal-row"
          className="mt-[26px] flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-col gap-[3px]">
            <p id="default-goal-label" className="text-[15px] font-semibold text-text-primary">
              Default weekly goal
            </p>
            <p className="text-[13.5px] leading-[1.45] text-secondary">
              Applied to each new week. You can still adjust it per week.
            </p>
          </div>
          <div className="flex items-center gap-[10px]">
            <button
              type="button"
              aria-label="Decrease default weekly goal"
              disabled={goalKm <= GOAL_MIN_KM}
              onClick={() => setGoalKm((value) => clampGoal(value - 1))}
              className={STEPPER_BUTTON_CLASSES}
            >
              −
            </button>
            {/* aria-live announces the new value to screen readers, since the
                buttons' labels alone never say where the value landed. */}
            <output
              aria-live="polite"
              aria-labelledby="default-goal-label"
              className="flex h-[48px] min-w-[92px] items-center justify-center rounded-[14px] border border-line-strong bg-white px-4 font-display text-[17px] font-bold text-text-primary"
            >
              {`${goalKm} km`}
            </output>
            <button
              type="button"
              aria-label="Increase default weekly goal"
              disabled={goalKm >= GOAL_MAX_KM}
              onClick={() => setGoalKm((value) => clampGoal(value + 1))}
              className={STEPPER_BUTTON_CLASSES}
            >
              +
            </button>
          </div>
        </div>
      </SettingsCard>

      {saveError && (
        <p role="alert" className="text-[13px] leading-[1.5] text-accent-pressed">
          {saveError}
        </p>
      )}
      {/* Right-aligned under the cards per the frame; full width below `sm`
          like every primary action (RUN-15, responsive addendum). */}
      <div className="flex justify-end">
        <button type="submit" disabled={saving} className={`${ACCENT_PILL_CLASSES} sm:w-auto`}>
          {saving ? 'Saving…' : 'Save changes'}
          <span aria-hidden="true" className="text-[17px]">
            →
          </span>
        </button>
      </div>
    </form>
  );
}

// 17 · Settings. The form only mounts after hydration because its draft is
// seeded from the stores, which the server cannot read; rendering nothing
// until then beats hydrating prefilled inputs against server-rendered empty
// ones.
//
// An account that signed up but never finished setup has no profile row, so
// the Training card would have nothing to save into (saveWeeklyDefault
// refuses to invent a running level). Such a visitor can only get here by
// deep link - the landing route sends them to the wizard - so this screen
// sends them there too instead of showing a form whose second half cannot
// work.
export default function SettingsView() {
  const hydrated = useHydrated();
  const router = useRouter();
  const profile = useProfile();
  const onboarded = profile !== null;

  useEffect(() => {
    if (hydrated && !onboarded) router.replace(ROUTES.setupGoal);
  }, [hydrated, onboarded, router]);

  return (
    <div className="px-5 pb-6 sm:px-8 lg:px-[40px] lg:pb-[32px]">
      {hydrated && onboarded && <SettingsForm />}
    </div>
  );
}
