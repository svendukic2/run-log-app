import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import RunDetailView from './RunDetailView';
import type { Run } from '@/lib/runs';

const RUN: Run = {
  id: 'run-detail',
  routeName: 'Morning loop',
  distanceKm: 8.2,
  durationSeconds: 2535, // 42:15
  date: '2026-07-07',
  effort: 'Medium',
  note: 'Felt strong today. Negative splits on the back half.',
};

function storeRuns(runs: Run[]) {
  window.localStorage.setItem('runlog.runs', JSON.stringify(runs));
}

describe('Run detail (RUN-27)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows the route name, date caption, effort badge and the Edit and Delete buttons (AC1)', () => {
    storeRuns([RUN]);
    render(<RunDetailView runId={RUN.id} />);

    expect(screen.getByRole('heading', { name: 'Morning loop' })).toBeInTheDocument();
    // The date also sits in the Details card, so the caption is read from the
    // header landmark alone.
    expect(within(screen.getByRole('banner')).getByText('Jul 7, 2026')).toBeInTheDocument();
    expect(screen.getByText('Medium effort')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('links the "All runs" breadcrumb back to the runs list (AC2)', () => {
    storeRuns([RUN]);
    render(<RunDetailView runId={RUN.id} />);

    expect(screen.getByRole('link', { name: /all runs/i })).toHaveAttribute('href', '/runs');
  });

  it('shows the four stat cards, with elevation display-only (AC3, AC6)', () => {
    storeRuns([RUN]);
    render(<RunDetailView runId={RUN.id} />);

    expect(screen.getByText('Distance').nextSibling).toHaveTextContent('8.2 km');
    expect(screen.getByText('Duration').nextSibling).toHaveTextContent('42:15');
    expect(screen.getByText('Avg pace').nextSibling).toHaveTextContent('5:09 /km');
    // Elevation is never captured for user runs, so the card shows a dash and
    // tells screen readers why (A10).
    expect(screen.getByText('Elevation').nextSibling).toHaveTextContent('–');
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
  });

  it('shows the Details card with route name, date, effort and manual-entry origin (AC3)', () => {
    storeRuns([RUN]);
    render(<RunDetailView runId={RUN.id} />);

    const details = screen.getByRole('region', { name: 'Details' });
    expect(within(details).getByText('Route name').nextSibling).toHaveTextContent('Morning loop');
    expect(within(details).getByText('Date').nextSibling).toHaveTextContent('Jul 7, 2026');
    expect(within(details).getByText('Effort').nextSibling).toHaveTextContent('Medium');
    expect(within(details).getByText('Logged').nextSibling).toHaveTextContent('Manual entry');
  });

  it('shows a decorative route sketch, not a map (AC4)', () => {
    storeRuns([RUN]);
    render(<RunDetailView runId={RUN.id} />);

    expect(screen.getByTestId('route-sketch')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the note when the run has one, and no Note card otherwise (AC5)', () => {
    storeRuns([RUN, { ...RUN, id: 'run-no-note', note: '' }]);

    const { unmount } = render(<RunDetailView runId={RUN.id} />);
    expect(screen.getByRole('heading', { name: 'Note' })).toBeInTheDocument();
    expect(screen.getByText(RUN.note)).toBeInTheDocument();
    unmount();

    render(<RunDetailView runId="run-no-note" />);
    expect(screen.queryByRole('heading', { name: 'Note' })).not.toBeInTheDocument();
  });

  it('keeps Edit and Delete inert until their modals land (AC7 seam)', async () => {
    storeRuns([RUN]);
    const user = userEvent.setup();
    render(<RunDetailView runId={RUN.id} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    // No modal exists yet, so the page simply stays as it is.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Morning loop' })).toBeInTheDocument();
  });

  it('shows the not-found state with the breadcrumb for an unknown id', () => {
    storeRuns([RUN]);
    render(<RunDetailView runId="missing" />);

    expect(screen.getByRole('heading', { name: 'Run not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /all runs/i })).toHaveAttribute('href', '/runs');
  });

  it('server-renders the breadcrumb without flashing the not-found state', () => {
    // The dynamic route is never prerendered, so jsdom rendering alone would
    // leave the SSR path unexercised. renderToString pins the store's server
    // snapshot contract and the hydration gate: before the client store is
    // read, the page shows the breadcrumb shell and no verdict on the id.
    const html = renderToString(<RunDetailView runId={RUN.id} />);

    expect(html).toContain('All runs');
    expect(html).not.toContain('Run not found');
  });
});
