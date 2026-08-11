import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { addRun } from '@/lib/runs';
import { seedRuns } from '@/test/runsApiMock';
import DashboardRunsSection from './DashboardRunsSection';

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

describe('Dashboard empty state (RUN-18)', () => {
  afterEach(() => {
    // The modal restores this on unmount; resetting after each test means a
    // regression there fails the test that caused it instead of leaking.
    document.body.style.overflow = '';
  });

  it('shows the plus icon, heading and designed copy before any run exists (AC1)', () => {
    render(<DashboardRunsSection />);

    expect(screen.getByRole('region', { name: 'Log your first run' })).toBeInTheDocument();
    expect(screen.getByTestId('first-run-icon')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Log your first run' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Add a run to start tracking your weekly distance, pace and personal records. Your charts and history will appear here.',
      ),
    ).toBeInTheDocument();
  });

  it('renders a neutral server shell, never the prompt, pre-hydration', () => {
    seedRuns([firstRun()]);

    // What the server ships cannot depend on the client-side runs cache; a
    // returning user must not see "Log your first run" flash before their
    // data hydrates in.
    expect(renderToString(<DashboardRunsSection />)).not.toMatch(/Log your first run/);
  });

  it('logs the first run end to end: prompt, modal, save, runs content (AC2, AC3)', async () => {
    const user = userEvent.setup();
    render(<DashboardRunsSection />);

    await user.click(screen.getByRole('button', { name: /add your first run/i }));
    expect(screen.getByRole('dialog', { name: 'Add run' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Route name'), 'Morning loop');
    await user.type(screen.getByLabelText('Distance (km)'), '8.2');
    await user.type(screen.getByLabelText('Duration'), '42:15');
    await user.click(screen.getByRole('button', { name: /save run/i }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Log your first run' })).toBeNull();
    expect(screen.getByText('Recent runs')).toBeInTheDocument();
    expect(screen.getByText('Morning loop')).toBeInTheDocument();
    // Closing the modal must hand the page its scroll back.
    expect(document.body.style.overflow).toBe('');
  });

  it('replaces the prompt when a run is saved through the store (AC3)', async () => {
    render(<DashboardRunsSection />);
    expect(screen.getByRole('region', { name: 'Log your first run' })).toBeInTheDocument();

    await act(async () => {
      await addRun(firstRun());
    });

    expect(screen.queryByRole('region', { name: 'Log your first run' })).toBeNull();
    expect(screen.getByText('Morning loop')).toBeInTheDocument();
  });

  it('shows the runs content directly when runs are already stored', () => {
    seedRuns([firstRun()]);

    render(<DashboardRunsSection />);

    expect(screen.queryByRole('region', { name: 'Log your first run' })).toBeNull();
    expect(screen.getByText('Recent runs')).toBeInTheDocument();
    expect(screen.getByText('Morning loop')).toBeInTheDocument();
  });

  it('stacks the distance chart above the recent runs card (RUN-19)', () => {
    seedRuns([firstRun()]);

    render(<DashboardRunsSection />);

    const chart = screen.getByRole('region', { name: 'Distance' });
    const runsCard = screen.getByRole('region', { name: 'Recent runs' });
    // The chart precedes the card in the DOM, matching 05's left column.
    expect(chart.compareDocumentPosition(runsCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
