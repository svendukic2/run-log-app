import AppShell from '@/components/AppShell';
import RequireSession from '@/components/RequireSession';

// Route group for the views behind the shared shell (RUN-13). Next.js
// keeps this layout mounted across /dashboard, /runs, /coach and /settings, so
// only the page below it re-renders on navigation. Onboarding lives outside the
// group and therefore renders without a sidebar (AC4). Guarded since RUN-58:
// a signed-out visitor lands on Sign in instead of an empty shell.
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RequireSession>
      <AppShell>{children}</AppShell>
    </RequireSession>
  );
}
