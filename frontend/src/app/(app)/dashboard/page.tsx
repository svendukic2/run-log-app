// Placeholder view: the full dashboard (header, goal card, charts) is built in
// later tickets (RUN-15+). RUN-13 only needs the route so shell navigation works.
// This is the default view the app opens on once onboarding is done.
export default function DashboardPage() {
  return (
    <div className="px-5 py-6 sm:px-8 lg:px-[40px] lg:py-[32px]">
      <h1 className="font-display text-[24px] font-bold tracking-[-0.6px] text-text-primary lg:text-[30px]">
        Dashboard
      </h1>
    </div>
  );
}
