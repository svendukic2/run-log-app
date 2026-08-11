import Link from 'next/link';
import { ROUTES } from '@/lib/routes';

// The public profile's placeholder (RUN-69 AC5 needs the participant and
// leaderboard rows to land somewhere honest; RUN-63 builds the real page,
// which is why this one deliberately fetches nothing - the user API those
// rows would read does not exist yet either).
//
// The same thin-first-cut construction RUN-68 used for the event detail:
// a real route with real copy, replaced wholesale rather than grown.
export default function PersonPlaceholderPage() {
  return (
    <section className="mx-5 mt-6 mb-6 flex flex-col items-start gap-[10px] rounded-[18px] border border-line bg-white p-[28px] sm:mx-8 lg:mx-[40px] lg:mt-[32px]">
      <h1 className="font-display text-[19px] font-bold tracking-[-0.3px] text-text-primary">
        Public profiles are on their way
      </h1>
      <p className="text-[13.5px] leading-[1.55] text-secondary">
        Runner profiles with records, weekly distance and recent runs land in the next release.
      </p>
      <Link
        href={ROUTES.events}
        className="mt-[6px] text-[14px] font-semibold text-accent hover:text-accent-pressed"
      >
        ← Back to events
      </Link>
    </section>
  );
}
