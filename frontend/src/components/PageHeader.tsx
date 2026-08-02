interface PageHeaderProps {
  // The small grey line above the title ("Good morning, Marko" on the
  // Dashboard, "Your activity" on Runs).
  overline: string;
  title: string;
  // Primary action, top right from `sm` up. Passed in as a slot so this stays a
  // server component and only the action itself has to run on the client.
  action?: React.ReactNode;
}

// Topbar from the Figma frames (node 48:34). The same pattern serves Dashboard
// and Runs, which differ only in copy and action. Below `sm` the action cannot
// sit next to the title without squeezing it, so the two stack and the action
// spans the full width (RUN-15, responsive addendum).
export default function PageHeader({ overline, title, action }: PageHeaderProps) {
  return (
    <header
      data-testid="page-header"
      className="flex flex-col items-stretch gap-4 px-5 pt-6 pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8 lg:px-[40px] lg:pt-[32px] lg:pb-[22px]"
    >
      <div className="flex min-w-0 flex-col gap-[3px]">
        <p className="text-[13px] text-tertiary">{overline}</p>
        <h1 className="font-display text-[24px] font-bold tracking-[-0.6px] text-text-primary lg:text-[30px]">
          {title}
        </h1>
      </div>
      {action}
    </header>
  );
}
