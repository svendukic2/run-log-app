import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { stampPlanGenerated } from '@/lib/plan';
import { addRun } from '@/lib/runs';
import { seedRuns } from '@/test/runsApiMock';
import CoachView, { PLAN_GENERATION_MS } from '@/components/CoachView';
import CoachPage from './page';

const HERO_NAME = 'Coaching starts after your first run';

function firstRun() {
  return {
    routeName: 'Morning loop',
    distanceKm: 8.2,
    durationSeconds: 2535,
    date: '2026-07-14',
    effort: 'Medium' as const,
    note: '',
  };
}

describe('AI Coach page (RUN-31)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('shows the overline and title with no page-level primary button (AC1)', () => {
    render(<CoachPage />);

    const header = screen.getByTestId('page-header');
    expect(within(header).getByText('Your training assistant')).toBeInTheDocument();
    expect(within(header).getByRole('heading', { level: 1, name: 'AI Coach' })).toBeInTheDocument();
    // No "Add run" pill here: the only header button is the notifications
    // bell (RUN-66), which every page carries.
    expect(within(header).getAllByRole('button')).toHaveLength(1);
    expect(within(header).getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(within(header).queryByRole('link')).toBeNull();
  });

  it('shows the dark hero with heading, copy and bullets before any run (AC2)', () => {
    render(<CoachPage />);

    const hero = screen.getByRole('region', { name: HERO_NAME });
    expect(
      within(hero).getByText(
        "Log a run and I'll analyze your distance, pace and effort to suggest safe weekly targets and simple pacing tips.",
      ),
    ).toBeInTheDocument();
    expect(
      within(hero)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Weekly targets', 'Pacing tips', 'Safe progression']);
  });

  it('opens the Add run modal from the hero button (AC3)', async () => {
    const user = userEvent.setup();
    render(<CoachPage />);

    await user.click(screen.getByRole('button', { name: /add your first run/i }));

    expect(screen.getByRole('dialog', { name: 'Add run' })).toBeInTheDocument();
  });

  it('hands focus back to the hero button when the modal is dismissed (AC3)', async () => {
    const user = userEvent.setup();
    render(<CoachPage />);

    const trigger = screen.getByRole('button', { name: /add your first run/i });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('saves the first run end to end: hero out, focus on what replaced it (AC3)', async () => {
    const user = userEvent.setup();
    render(<CoachPage />);

    await user.click(screen.getByRole('button', { name: /add your first run/i }));
    await user.type(screen.getByLabelText('Route name'), 'Morning loop');
    await user.type(screen.getByLabelText('Distance (km)'), '8.2');
    await user.type(screen.getByLabelText('Duration'), '42:15');
    await user.click(screen.getByRole('button', { name: /save run/i }));

    // The save round-trips through /api/runs (RUN-48), so the swap lands
    // asynchronously after the click.
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: HERO_NAME })).toBeNull();
    });
    // The first plan generates right away (RUN-32, A16)...
    const planTitle = screen.getByText("This week's plan");
    // ...and the hero (with its button) unmounted, so focus lands on the
    // content that replaced it rather than falling onto body.
    await waitFor(() => {
      expect(document.activeElement?.contains(planTitle)).toBe(true);
    });
  });

  it('drops the hero once a run exists in the store', async () => {
    render(<CoachPage />);
    expect(screen.getByRole('region', { name: HERO_NAME })).toBeInTheDocument();

    await act(async () => {
      await addRun(firstRun());
    });

    expect(screen.queryByRole('region', { name: HERO_NAME })).toBeNull();
  });

  it('shows the insight cards and previous plans alongside the plan (RUN-34)', () => {
    seedRuns([firstRun()]);

    render(<CoachPage />);

    expect(screen.getByText("This week's plan")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent load' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pace trend' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Consistency' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Previous plans' })).toBeInTheDocument();
  });

  it('renders a neutral server shell, never the hero, pre-hydration', () => {
    seedRuns([firstRun()]);

    // The view ships nothing from the server; the page shell still carries
    // its static header.
    expect(renderToString(<CoachView />)).toBe('');
    const page = renderToString(<CoachPage />);
    expect(page).toContain('AI Coach');
    expect(page).not.toContain(HERO_NAME);
  });

  describe('plan regeneration (RUN-35)', () => {
    function setup() {
      // Wed 5 Aug 2026; firstRun's Jul 14 sits inside the insight window.
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5, 9, 0));
      return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    }

    afterEach(() => {
      jest.useRealTimers();
    });

    it('switches to the generating card with the designed copy (AC1)', async () => {
      const user = setup();
      seedRuns([firstRun()]);
      render(<CoachPage />);

      await user.click(screen.getByRole('button', { name: 'Regenerate' }));

      const card = screen.getByRole('region', { name: 'Generating new plan' });
      expect(within(card).getByText('just now')).toBeInTheDocument();
      expect(within(card).getByText('Reading your training...')).toBeInTheDocument();
      expect(
        within(card).getByText(
          "Analyzing your last 4 weeks of distance, pace and effort to shape next week's plan.",
        ),
      ).toBeInTheDocument();
      // The stable slot around the card carries the busy flag, and the
      // start of generation is announced outside that busy subtree.
      expect(document.querySelector('[aria-busy="true"]')).toContainElement(card);
      expect(screen.getByTestId('regen-status')).toHaveTextContent('Generating a new plan.');
      // The plan card is gone, and its Regenerate with it; no cancel
      // control exists (AC2), so a second trigger is impossible.
      expect(screen.queryByText("This week's plan")).toBeNull();
      expect(screen.queryByRole('button', { name: 'Regenerate' })).toBeNull();
      expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
    });

    it('dims the insight cards and previous plans while generating (AC2)', async () => {
      const user = setup();
      seedRuns([firstRun()]);
      render(<CoachPage />);
      expect(document.querySelector('.opacity-40')).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Regenerate' }));

      // Visual de-emphasis only: the content stays in the accessibility
      // tree (its controls are already-inert seams).
      const dimmed = document.querySelector('.opacity-40');
      expect(dimmed).not.toBeNull();
      expect(dimmed).toHaveClass('pointer-events-none');
      expect(within(dimmed as HTMLElement).getByText('Previous plans')).toBeInTheDocument();
      expect(within(dimmed as HTMLElement).getByText('Recent load')).toBeInTheDocument();
    });

    it('replaces the skeletons with the fresh plan when generation completes (AC3)', async () => {
      const user = setup();
      seedRuns([firstRun()]);
      render(<CoachPage />);

      await user.click(screen.getByRole('button', { name: 'Regenerate' }));
      act(() => {
        jest.advanceTimersByTime(PLAN_GENERATION_MS);
      });

      expect(screen.queryByRole('region', { name: 'Generating new plan' })).toBeNull();
      const card = screen.getByRole('region', { name: "This week's plan" });
      expect(within(card).getByText(/updated just now/)).toBeInTheDocument();
      expect(screen.getByTestId('regen-status')).toHaveTextContent('New plan ready.');
      expect(document.querySelector('.opacity-40')).toBeNull();
      expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    });

    it('keeps the previous plan when the stamp write fails (AC4, A22)', async () => {
      const user = setup();
      stampPlanGenerated(Date.now() - 2 * 3_600_000);
      seedRuns([firstRun()]);
      render(<CoachPage />);
      expect(screen.getByText(/updated 2h ago/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Regenerate' }));
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      act(() => {
        jest.advanceTimersByTime(PLAN_GENERATION_MS);
      });
      setItem.mockRestore();
      warn.mockRestore();

      // Back on the plan card with the old caption, and the announcement
      // does not pretend the regeneration succeeded.
      expect(screen.getByRole('region', { name: "This week's plan" })).toBeInTheDocument();
      expect(screen.getByText(/updated 2h ago/)).toBeInTheDocument();
      expect(screen.getByTestId('regen-status')).toHaveTextContent('Plan unchanged.');
    });

    it('moves focus to the plan slot when Regenerate unmounts under it', async () => {
      const user = setup();
      seedRuns([firstRun()]);
      render(<CoachPage />);

      await user.click(screen.getByRole('button', { name: 'Regenerate' }));

      // The button focus was on is gone; focus lands on the stable slot
      // wrapping the generating card instead of falling to <body>.
      const slot = document.querySelector('[aria-busy="true"]') as HTMLElement;
      expect(slot).toHaveFocus();
    });

    it('returns focus to Regenerate when generation completes (AC3)', async () => {
      const user = setup();
      seedRuns([firstRun()]);
      render(<CoachPage />);

      await user.click(screen.getByRole('button', { name: 'Regenerate' }));
      act(() => {
        jest.advanceTimersByTime(PLAN_GENERATION_MS);
      });

      expect(screen.getByRole('button', { name: 'Regenerate' })).toHaveFocus();
    });

    it('never steals focus back from a user who tabbed away mid-generation', async () => {
      const user = setup();
      seedRuns([firstRun()]);
      render(<CoachPage />);

      await user.click(screen.getByRole('button', { name: 'Regenerate' }));
      const viewAll = screen.getByRole('button', { name: 'View all' });
      act(() => {
        viewAll.focus();
      });
      act(() => {
        jest.advanceTimersByTime(PLAN_GENERATION_MS);
      });

      expect(viewAll).toHaveFocus();
    });

    it('clears a pending generation when the page unmounts', async () => {
      const user = setup();
      seedRuns([firstRun()]);
      const { unmount } = render(<CoachPage />);

      await user.click(screen.getByRole('button', { name: 'Regenerate' }));
      unmount();

      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
