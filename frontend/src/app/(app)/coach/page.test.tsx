import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { addRun } from '@/lib/runs';
import CoachView from '@/components/CoachView';
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
    expect(within(header).queryByRole('button')).toBeNull();
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

    expect(screen.queryByRole('region', { name: HERO_NAME })).toBeNull();
    // The first plan generates right away (RUN-32, A16)...
    const planTitle = screen.getByText("This week's plan");
    // ...and the hero (with its button) unmounted, so focus lands on the
    // content that replaced it rather than falling onto body.
    expect(document.activeElement?.contains(planTitle)).toBe(true);
  });

  it('drops the hero once a run exists in the store', () => {
    render(<CoachPage />);
    expect(screen.getByRole('region', { name: HERO_NAME })).toBeInTheDocument();

    act(() => {
      addRun(firstRun());
    });

    expect(screen.queryByRole('region', { name: HERO_NAME })).toBeNull();
  });

  it('shows the insight cards and previous plans alongside the plan (RUN-34)', () => {
    addRun(firstRun());

    render(<CoachPage />);

    expect(screen.getByText("This week's plan")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent load' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pace trend' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Consistency' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Previous plans' })).toBeInTheDocument();
  });

  it('renders a neutral server shell, never the hero, pre-hydration', () => {
    addRun(firstRun());

    // The view ships nothing from the server; the page shell still carries
    // its static header.
    expect(renderToString(<CoachView />)).toBe('');
    const page = renderToString(<CoachPage />);
    expect(page).toContain('AI Coach');
    expect(page).not.toContain(HERO_NAME);
  });
});
