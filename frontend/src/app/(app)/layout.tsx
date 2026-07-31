import Sidebar from '@/components/Sidebar';

// Shared shell for the four main app views (RUN-12): the fixed dark sidebar
// plus a light content area. Onboarding screens live outside this group.
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex flex-1 items-start bg-canvas">
      <Sidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
