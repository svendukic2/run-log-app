'use client';

import { useState } from 'react';
import { ACCENT_PILL_CLASSES } from '@/components/accentPill';
import TextField from '@/components/TextField';
import { clampGoal, GOAL_DEFAULT_KM, GOAL_MAX_KM, GOAL_MIN_KM } from '@/lib/goal';
import { profileInitials, saveProfileSettings, useProfile, type Profile } from '@/lib/onboarding';
import { savePrivacySettings, usePrivacy, type PrivacySettings } from '@/lib/privacy';
import { validateProfileForm, type ProfileFormErrors } from '@/lib/profileValidation';
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
// the *stored* profile, not from what is typed in the inputs, so they only
// change once a save succeeds (AC4). There is deliberately no upload control:
// the caption is the whole story ("no upload exists", SET-2).
function AvatarBlock({ profile }: { profile: Profile | null }) {
  return (
    <div data-testid="avatar-block" className="mt-[26px] flex items-center gap-[18px]">
      <div className="flex size-[64px] shrink-0 items-center justify-center rounded-full bg-accent-soft">
        <span className="font-display text-[20px] font-bold text-accent">
          {profile ? profileInitials(profile) : ''}
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

// One privacy row: label and helper copy left, the switch right, matching
// the Training row's shape (and stacking the same way on a phone).
//
// A button with role="switch" rather than a checkbox: these are settings
// that take effect on Save, and the switch role is what tells a screen
// reader "on/off state", which is exactly what the control is. The helper
// copy is wired through aria-describedby, so the reason for the setting is
// announced with it instead of being decoration for sighted users only.
function PrivacyToggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-[3px]">
        <p id={`${id}-label`} className="text-[15px] font-semibold text-text-primary">
          {label}
        </p>
        <p id={`${id}-hint`} className="text-[13.5px] leading-[1.45] text-secondary">
          {hint}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        onClick={() => onChange(!checked)}
        // The pill is 52x30 by design, which is under the 44 px minimum
        // touch target on a phone, so a pseudo-element grows the HIT area
        // to 66x44 without moving anything on screen (responsive addendum).
        className={`relative h-[30px] w-[52px] shrink-0 self-start rounded-full transition-colors before:absolute before:-inset-[7px] before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:self-auto ${
          checked ? 'bg-accent' : 'bg-line-strong'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-[3px] size-[24px] rounded-full bg-white transition-[left] ${
            checked ? 'left-[25px]' : 'left-[3px]'
          }`}
        />
      </button>
    </div>
  );
}

// The settings body owns the draft for every card because the page has a
// single "Save changes" button (RUN-36): submit persists the profile (RUN-37),
// the Training default (RUN-38, RUN-39) and the privacy toggles (RUN-64) in
// one action.
function SettingsForm() {
  // Mounted behind the app-data boundary (RUN-50), so the profile store has
  // settled and the record is available to seed the draft synchronously -
  // no effect, no controlled-input flicker.
  const profile = useProfile();
  const [firstName, setFirstName] = useState(profile?.firstName ?? '');
  const [lastName, setLastName] = useState(profile?.lastName ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  // The stepper's draft, like the profile fields: seeded from the stored
  // default and only persisted on Save.
  const [goalKm, setGoalKm] = useState(() => profile?.defaultWeeklyGoalKm ?? GOAL_DEFAULT_KM);
  // The privacy draft (RUN-64), seeded from the stored settings for the
  // same reason: behind the boundary they have loaded, so the switches
  // render the account's real state on the first paint rather than
  // flashing the private defaults.
  const storedPrivacy = usePrivacy();
  const [privacy, setPrivacy] = useState<PrivacySettings>(storedPrivacy);
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const privacyChanged =
    privacy.profilePublic !== storedPrivacy.profilePublic ||
    privacy.showOnLeaderboard !== storedPrivacy.showOnLeaderboard ||
    privacy.showRoutes !== storedPrivacy.showRoutes;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const nextErrors = validateProfileForm({ firstName, lastName, email });
    setErrors(nextErrors);
    // Invalid drafts only show their inline messages; nothing is persisted
    // (AC3), so reloading would still bring back the last saved values.
    if (Object.keys(nextErrors).length > 0) return;

    const draft: Profile = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
    };
    setSaving(true);
    setSaveError('');
    try {
      // One full-replace PUT carries the profile fields AND the default
      // weekly goal (SET-3). SET-6 - a changed default leaves the running
      // week's target alone - is the server's job now: it freezes the
      // current week before the new default lands (RUN-49).
      await saveProfileSettings({ ...draft, defaultWeeklyGoalKm: goalKm });
      // The inputs adopt the trimmed values that were actually stored, so
      // what the card shows is exactly what a reload would show. Done
      // BEFORE the privacy PUT below (review fix): that write can fail on
      // its own, and leaving these inputs on the pre-trim draft would show
      // untrimmed text next to an avatar already rendering the trimmed
      // stored name, under a message about privacy.
      setFirstName(draft.firstName);
      setLastName(draft.lastName);
      setEmail(draft.email);
      // The privacy toggles are a second resource (they live on the
      // account row, not in the profile), so they take a second PUT - and
      // only when they actually changed, so editing a name does not
      // rewrite settings the user never touched. Both PUTs are full
      // replaces, so a failure of this one leaves the profile saved, the
      // toggles as drafted and the failure on screen: pressing Save again
      // re-sends both and repairs it.
      if (privacyChanged) {
        await savePrivacySettings(privacy);
      }
    } catch (error) {
      // Pessimistic like every write since RUN-48: the failure stays on
      // screen and nothing pretends to be saved.
      setSaveError(
        error instanceof ApiError ? error.message : 'Saving the changes failed. Try again.',
      );
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
        <AvatarBlock profile={profile} />
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

      <SettingsCard title="Privacy">
        {/* Three grants, all off by default (RUN-64 AC3): nothing about an
            account is shared with other runners until its owner says so
            here. Each row spells out what turning it on actually exposes,
            because "Public profile" alone does not say what a visitor
            would see. */}
        <div className="mt-[26px] flex flex-col gap-[22px]">
          <PrivacyToggle
            id="privacy-profile-public"
            label="Public profile"
            hint="Other runners can open your profile and see your records, weekly distance and recent runs."
            checked={privacy.profilePublic}
            onChange={(next) => setPrivacy((current) => ({ ...current, profilePublic: next }))}
          />
          <PrivacyToggle
            id="privacy-leaderboard"
            label="Show me on leaderboards"
            hint="Your name and distance appear on leaderboards, global and inside events you join. Off means you are ranked nowhere."
            checked={privacy.showOnLeaderboard}
            onChange={(next) => setPrivacy((current) => ({ ...current, showOnLeaderboard: next }))}
          />
          <PrivacyToggle
            id="privacy-routes"
            label="Show my route maps"
            hint="Route maps on your runs are shown to anyone who can see your profile. Your distances and times are not affected."
            checked={privacy.showRoutes}
            onChange={(next) => setPrivacy((current) => ({ ...current, showRoutes: next }))}
          />
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
// seeded from localStorage (RUN-37 AC2), which the server cannot read;
// rendering nothing until then beats hydrating prefilled inputs against
// server-rendered empty ones.
export default function SettingsView() {
  const hydrated = useHydrated();

  return (
    <div className="px-5 pb-6 sm:px-8 lg:px-[40px] lg:pb-[32px]">
      {hydrated && <SettingsForm />}
    </div>
  );
}
