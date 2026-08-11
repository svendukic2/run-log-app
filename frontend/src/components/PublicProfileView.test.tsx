import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Run } from '@/lib/runs';
import { armProfileLoad, failFollowApi, seedPublicProfile } from '@/test/usersApiMock';
import PublicProfileView from './PublicProfileView';
import PublicRunDetailView from './PublicRunDetailView';

const RUNS: Run[] = [
  {
    id: 'run-1',
    routeName: 'Riverside loop',
    distanceKm: 8.2,
    durationSeconds: 2535,
    date: '2026-08-01',
    effort: 'Medium',
    note: 'Felt strong',
  },
  {
    id: 'run-2',
    routeName: 'Hill repeats',
    distanceKm: 12,
    durationSeconds: 3900,
    date: '2026-07-28',
    effort: 'Hard',
    note: '',
  },
];

describe('PublicProfileView (RUN-63)', () => {
  // AC1: a public profile renders the header plus records, weekly distance
  // and recent runs, all derived from that runner's runs - and nothing that
  // could write.
  it('renders the header and the whole body for a public profile', () => {
    const profile = seedPublicProfile({
      firstName: 'Ana',
      profilePublic: true,
      followers: 12,
      followingCount: 4,
      runs: RUNS,
    });

    render(<PublicProfileView userId={profile.id} />);

    expect(screen.getByRole('heading', { name: /Ana Tester/ })).toBeInTheDocument();
    expect(screen.getByText('12 followers · 4 following')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument();

    expect(screen.getByRole('region', { name: 'Records' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Distance' })).toBeInTheDocument();
    const recent = screen.getByRole('region', { name: 'Recent runs' });
    expect(recent).toHaveTextContent('Riverside loop');
    // AC4: the row is a link into the read-only detail, not a menu.
    expect(screen.getByRole('link', { name: /Riverside loop/ })).toHaveAttribute(
      'href',
      `/people/${profile.id}/runs/run-1`,
    );

    // Read only means read only: no edit, delete, kebab or add anywhere.
    expect(screen.queryByRole('button', { name: /edit|delete|add run|more/i })).toBeNull();
    // And no "View all", which would point at the signed-in user's own list.
    expect(screen.queryByRole('link', { name: 'View all' })).toBeNull();
  });

  // AC2: a private profile still renders its header and follow button, and
  // the body is ABSENT - the server sent no runs at all.
  it('renders only the header and the private notice for a private profile', () => {
    const profile = seedPublicProfile({ firstName: 'Bruno', runs: RUNS });

    expect(profile.runs).toBeNull();

    render(<PublicProfileView userId={profile.id} />);

    expect(screen.getByRole('heading', { name: /Bruno Tester/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument();
    expect(screen.getByText('This profile is private')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Records' })).toBeNull();
    expect(screen.queryByText('Riverside loop')).toBeNull();
  });

  // AC3: the owner opening their own URL sees everything, whatever the
  // toggles say.
  it('renders the full body for the owner of a private profile', () => {
    const profile = seedPublicProfile({ firstName: 'Carla', me: true, runs: RUNS });

    render(<PublicProfileView userId={profile.id} />);

    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Records' })).toBeInTheDocument();
    expect(screen.queryByText('This profile is private')).toBeNull();
    // You cannot follow yourself, so no button is offered.
    expect(screen.queryByRole('button', { name: /Follow/ })).toBeNull();
  });

  // AC5: an id that matches nothing is the designed not-found state, not a
  // crash and not an error card.
  it('shows the not-found state for an unknown id', async () => {
    armProfileLoad();

    render(<PublicProfileView userId="user-ghost" />);

    expect(await screen.findByText("This runner doesn't exist")).toBeInTheDocument();
  });

  // The header's one mutation, held to the app-wide pattern: awaited, and a
  // failure lands inline as role="alert" instead of a silent revert.
  it('follows, updates the count, and reports a failure inline', async () => {
    const profile = seedPublicProfile({
      firstName: 'Ana',
      profilePublic: true,
      followers: 2,
      runs: RUNS,
    });

    render(<PublicProfileView userId={profile.id} />);

    await userEvent.click(screen.getByRole('button', { name: 'Follow' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Following' })).toBeVisible());
    expect(screen.getByText('3 followers · 0 following')).toBeInTheDocument();

    failFollowApi('DELETE');
    await userEvent.click(screen.getByRole('button', { name: 'Following' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Unfollowing this runner failed/);
    // The failed call changed nothing on screen.
    expect(screen.getByRole('button', { name: 'Following' })).toBeInTheDocument();
  });
});

describe('PublicRunDetailView (RUN-63 AC4)', () => {
  // The run detail reached from a profile row: everything the owner's own
  // detail shows, minus every write, with the Route card gated on
  // showRoutes.
  it.each([
    ['hides the route card when showRoutes is off', false],
    ['shows the route card when showRoutes is on', true],
  ])('%s', (_case, showRoutes) => {
    const profile = seedPublicProfile({
      firstName: 'Ana',
      profilePublic: true,
      showRoutes,
      runs: RUNS,
    });

    render(<PublicRunDetailView userId={profile.id} runId="run-1" />);

    expect(screen.getByRole('heading', { name: 'Riverside loop' })).toBeInTheDocument();
    expect(screen.getByText('Felt strong')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit|Delete/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Route' })).toEqual(
      showRoutes ? expect.anything() : null,
    );
  });
});
