import CoachView from '@/components/CoachView';
import PageHeader from '@/components/PageHeader';

// 14/15 · AI Coach. The header carries no page-level primary action (AIC-1):
// the page's actions live inside its cards.
export default function CoachPage() {
  return (
    <>
      <PageHeader overline="Your training assistant" title="AI Coach" />

      <div className="flex flex-col gap-5 px-5 pb-6 sm:px-8 lg:px-[40px] lg:pb-[32px]">
        <CoachView />
      </div>
    </>
  );
}
