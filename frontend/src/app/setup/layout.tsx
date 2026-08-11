import RequireSession from '@/components/RequireSession';

// The setup steps run AFTER signup since RUN-58, so they are guarded like
// every app route: no session, no wizard - Sign in first (AC1). They still
// render without the sidebar (the shell belongs to the (app) group only).
export default function SetupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <RequireSession>{children}</RequireSession>;
}
