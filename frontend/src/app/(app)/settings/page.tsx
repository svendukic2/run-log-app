import PageHeader from '@/components/PageHeader';
import SettingsView from '@/components/SettingsView';

// 17 · Settings (RUN-36). Header and page scaffold: overline, title and the
// settings body. The body lives in SettingsView, a client component, because
// the Profile card drafts and saves the stored profile (RUN-37), the Training
// card holds the default-goal stepper (RUN-38) and the single Save changes
// button persists both silently in one action (RUN-39). There is deliberately
// no exit control: leaving the page happens only via the sidebar (AC3).
export default function SettingsPage() {
  return (
    <>
      <PageHeader overline="Manage your profile" title="Settings" />
      <SettingsView />
    </>
  );
}
