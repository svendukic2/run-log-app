import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { addRun, type Run } from '@/lib/runs';
import RunDetailView from './RunDetailView';

function seedRun(overrides: Partial<Omit<Run, 'id'>> = {}): Run {
  return addRun({
    routeName: 'Morning loop',
    distanceKm: 8.2,
    durationSeconds: 2535,
    date: '2026-07-07',
    effort: 'Medium',
    note: '',
    ...overrides,
  });
}

describe('Run detail (RUN-27)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows route name, date caption, effort badge and Edit/Delete (AC1)', () => {
    const run = seedRun();

    render(<RunDetailView runId={run.id} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Morning loop' })).toBeInTheDocument();
    const caption = screen.getByTestId('run-detail-caption');
    expect(within(caption).getByText('Jul 7, 2026')).toBeInTheDocument();
    expect(within(caption).getByText('Medium effort')).toBeInTheDocument();
    // Edit is live since RUN-28; Delete stays a visible seam until RUN-30
    // wires it up, announcing itself as not yet available.
    expect(screen.getByRole('button', { name: 'Edit' })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('links the "All runs" breadcrumb back to the list (AC2)', () => {
    const run = seedRun();

    render(<RunDetailView runId={run.id} />);

    expect(screen.getByRole('link', { name: /all runs/i })).toHaveAttribute('href', '/runs');
  });

  it('shows the four stat cards and the Details card (AC3)', () => {
    const run = seedRun();

    render(<RunDetailView runId={run.id} />);

    expect(screen.getByText('Distance')).toBeInTheDocument();
    expect(screen.getByText('8.2 km')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('42:15')).toBeInTheDocument();
    expect(screen.getByText('Avg pace')).toBeInTheDocument();
    // 2535 s over 8.2 km.
    expect(screen.getByText('5:09 /km')).toBeInTheDocument();
    expect(screen.getByText('Elevation')).toBeInTheDocument();

    const details = screen.getByRole('region', { name: 'Details' });
    expect(within(details).getByText('Route name')).toBeInTheDocument();
    expect(within(details).getByText('Morning loop')).toBeInTheDocument();
    expect(within(details).getByText('Date')).toBeInTheDocument();
    expect(within(details).getByText('Jul 7, 2026')).toBeInTheDocument();
    expect(within(details).getByText('Effort')).toBeInTheDocument();
    expect(within(details).getByText('Medium')).toBeInTheDocument();
    expect(within(details).getByText('Logged')).toBeInTheDocument();
    expect(within(details).getByText('Manual entry')).toBeInTheDocument();
  });

  it('renders a decorative sketch in the Route card, not a map (AC4)', () => {
    const run = seedRun();

    render(<RunDetailView runId={run.id} />);

    expect(screen.getByRole('region', { name: 'Route' })).toBeInTheDocument();
    // The sketch is decorative and carries no accessible content of its own.
    const sketch = screen.getByTestId('route-sketch');
    expect(sketch).toHaveAttribute('aria-hidden', 'true');
    // Start dot (filled) and end dot (ring).
    expect(within(sketch).getByTestId('route-start')).toBeInTheDocument();
    expect(within(sketch).getByTestId('route-end')).toBeInTheDocument();
  });

  it('shows the Note card only when the run has a note (AC5, A11)', () => {
    const withNote = seedRun({ note: 'Felt strong today.\nNegative splits.' });
    const { unmount } = render(<RunDetailView runId={withNote.id} />);
    expect(screen.getByRole('region', { name: 'Note' })).toBeInTheDocument();
    // The user's line breaks survive rendering.
    const note = screen.getByText(/Felt strong today/);
    expect(note).toHaveTextContent('Negative splits.');
    expect(note).toHaveClass('whitespace-pre-line');
    unmount();

    window.localStorage.clear();
    const withoutNote = seedRun();
    render(<RunDetailView runId={withoutNote.id} />);
    expect(screen.queryByRole('region', { name: 'Note' })).toBeNull();
  });

  it('treats a whitespace-only note as no note (A11)', () => {
    const run = seedRun({ note: '   ' });

    render(<RunDetailView runId={run.id} />);

    expect(screen.queryByRole('region', { name: 'Note' })).toBeNull();
  });

  it('keeps start time, elevation and route type empty for user runs (AC6, A10)', () => {
    const run = seedRun();

    render(<RunDetailView runId={run.id} />);

    // Caption is the bare date, no "· 07:20" start time.
    const caption = screen.getByTestId('run-detail-caption');
    expect(within(caption).getByText('Jul 7, 2026')).toBeInTheDocument();
    expect(within(caption).queryByText(/·/)).toBeNull();
    // Elevation shows a placeholder, not a number.
    expect(screen.getByText('Not captured')).toBeInTheDocument();
    // The Route card carries no "Road · out & back" type caption.
    const route = screen.getByRole('region', { name: 'Route' });
    expect(within(route).queryByText(/road|trail|out & back/i)).toBeNull();
  });

  it('opens the Edit run modal prefilled from this run (RUN-28 AC1, DET-2)', async () => {
    const user = userEvent.setup();
    const run = seedRun({ note: 'Windy' });
    render(<RunDetailView runId={run.id} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByRole('dialog', { name: 'Edit run' })).toBeInTheDocument();
    expect(screen.getByLabelText('Route name')).toHaveValue('Morning loop');
    expect(screen.getByLabelText('Distance (km)')).toHaveValue('8.2');
    expect(screen.getByLabelText('Duration')).toHaveValue('42:15');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-07-07');
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('Windy');
  });

  it('reflects a saved edit immediately, without leaving the page (RUN-28 AC2)', async () => {
    const user = userEvent.setup();
    const run = seedRun();
    render(<RunDetailView runId={run.id} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const routeName = screen.getByLabelText('Route name');
    await user.clear(routeName);
    await user.type(routeName, 'Corrected loop');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    // The modal is gone and the detail re-read the store.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Corrected loop' })).toBeInTheDocument();
    // Focus lands back on the button that opened the modal.
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
  });

  it('leaves the run unchanged when the edit is cancelled (RUN-28 AC3)', async () => {
    const user = userEvent.setup();
    const run = seedRun();
    render(<RunDetailView runId={run.id} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const routeName = screen.getByLabelText('Route name');
    await user.clear(routeName);
    await user.type(routeName, 'Discarded');
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Morning loop' })).toBeInTheDocument();
  });

  it('explains itself when the id matches no stored run', () => {
    seedRun();

    render(<RunDetailView runId="does-not-exist" />);

    expect(screen.getByRole('heading', { name: 'Run not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /all runs/i })).toHaveAttribute('href', '/runs');
  });

  it('renders an empty server shell before hydration', () => {
    const run = seedRun();

    // localStorage is invisible to the server, so the contract is that the
    // server ships nothing at all and the page appears after hydration.
    expect(renderToString(<RunDetailView runId={run.id} />)).toBe('');
  });
});
