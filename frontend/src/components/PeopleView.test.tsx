import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { seedRunners } from '@/test/usersApiMock';
import PeopleView from './PeopleView';

// RUN-62. Three tests for three ACs: the search finds people and their rows
// link to their profiles (AC1/AC5), Follow flips in place without leaving
// the page (AC2), and a query nobody matches says so (AC3). Everything else
// - the debounce timing, the load token, the row layout - is exercised
// through these rather than pinned down separately.

function box() {
  return screen.getByLabelText('Find runners');
}

describe('PeopleView', () => {
  it('shows my follow counts before anything is typed (AC3)', async () => {
    seedRunners([{ firstName: 'Ana' }, { firstName: 'Ivan', following: true }], {
      myFollowers: 2,
    });
    render(<PeopleView />);

    expect(await screen.findByText(/2 followers · 1 following/)).toBeInTheDocument();
    // Nothing is claimed about who exists until a name is typed.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('searches by name and links each row to that profile (AC1, AC5)', async () => {
    seedRunners([{ firstName: 'Ana' }, { firstName: 'Bruno' }]);
    const user = userEvent.setup();
    render(<PeopleView />);

    // Upper case against a lower-cased row, and only part of the name: the
    // matching is the server's, and the mock mirrors it.
    await user.type(box(), 'AN');

    const row = await screen.findByRole('link', { name: 'Ana Tester' });
    expect(row).toHaveAttribute('href', '/people/user-ana');
    expect(screen.queryByRole('link', { name: 'Bruno Tester' })).not.toBeInTheDocument();
  });

  it('follows from the row without leaving the page (AC2)', async () => {
    seedRunners([{ firstName: 'Ana' }]);
    const user = userEvent.setup();
    render(<PeopleView />);

    await user.type(box(), 'ana');
    await user.click(await screen.findByRole('button', { name: 'Follow' }));

    // The row flipped in place, and my own following count moved with it.
    expect(await screen.findByRole('button', { name: 'Following' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ana Tester' })).toBeInTheDocument();
    expect(screen.getByText(/1 following/)).toBeInTheDocument();

    // Clicking again unfollows through the same idempotent API.
    await user.click(screen.getByRole('button', { name: 'Following' }));
    expect(await screen.findByRole('button', { name: 'Follow' })).toBeInTheDocument();
  });

  it('says so when nobody matches (AC3)', async () => {
    seedRunners([{ firstName: 'Ana' }]);
    const user = userEvent.setup();
    render(<PeopleView />);

    await user.type(box(), 'zzz');

    expect(await screen.findByText(/No runners match/)).toBeInTheDocument();
  });
});
