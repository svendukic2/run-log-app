// Pill badge ("Welcome", "Welcome, {name}", "Last step") from the design library.
export default function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-accent-soft px-[14px] py-[6px] text-[14px] font-semibold text-accent-pressed">
      {children}
    </span>
  );
}
