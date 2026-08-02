import AppShell from '@/components/AppShell';

// Route group for the four views behind the shared shell (RUN-13). Next.js
// keeps this layout mounted across /dashboard, /runs, /coach and /settings, so
// only the page below it re-renders on navigation. Onboarding lives outside the
// group and therefore renders without a sidebar (AC4).
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
