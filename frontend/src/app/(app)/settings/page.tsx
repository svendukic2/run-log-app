import { ACCENT_PILL_CLASSES } from '@/components/accentPill';
import PageHeader from '@/components/PageHeader';

// Card shell shared by the two settings cards, matching the dashboard cards
// (RUN-17). RUN-37 and RUN-38 fill these with the profile inputs and the
// weekly-goal stepper; here only the card, its heading and its place in the
// column exist.
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

// 17 · Settings (RUN-36). Header and page scaffold: overline, title, the
// Profile and Training cards and the single Save changes button. The card
// contents are built in RUN-37/38 and the button is wired to persistence in
// RUN-39, so it renders inert here. There is deliberately no exit control:
// leaving the page happens only via the sidebar (AC3).
export default function SettingsPage() {
  return (
    <>
      <PageHeader overline="Manage your profile" title="Settings" />

      <div className="px-5 pb-6 sm:px-8 lg:px-[40px] lg:pb-[32px]">
        {/* The frame stacks both cards and the button in one 660px column
            against the content's left edge; below `sm` the column spans the
            viewport inside the shared page padding. */}
        <div data-testid="settings-body" className="flex max-w-[660px] flex-col gap-5">
          <SettingsCard title="Profile" />
          <SettingsCard title="Training" />

          {/* Right-aligned under the cards per the frame; full width below
              `sm` like every primary action (RUN-15, responsive addendum). */}
          <div className="flex justify-end">
            <button type="button" className={`${ACCENT_PILL_CLASSES} sm:w-auto`}>
              Save changes
              <span aria-hidden="true" className="text-[17px]">
                →
              </span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
