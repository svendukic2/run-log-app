import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import {
  clearTestSession,
  failAccountApi,
  makeAccountLoadFail,
  restoreAccountApi,
  seedAccount,
} from '@/test/runsApiMock';
import {
  __resetAccountStoreForTests,
  accountInitials,
  accountShortName,
  getAccountRecord,
  saveAccountDetails,
  useAccount,
  useAccountError,
  useAccountStatus,
} from './account';

// The identity store (RUN-59): the account's name and email, the app's
// single source of truth for both.
function AccountProbe() {
  const account = useAccount();
  return React.createElement(
    React.Fragment,
    null,
    React.createElement('span', { 'data-testid': 'status' }, useAccountStatus()),
    React.createElement('span', { 'data-testid': 'name' }, account?.firstName ?? ''),
    React.createElement('span', { 'data-testid': 'email' }, account?.email ?? ''),
    React.createElement('span', { 'data-testid': 'error' }, useAccountError()?.message ?? ''),
  );
}

function names(firstName: string, lastName: string) {
  return { firstName, lastName, email: 'test@email.com' };
}

describe('account display helpers (RUN-14, moved in RUN-59)', () => {
  it('derives the initials from first and last name, uppercased', () => {
    expect(accountInitials(names('Marko', 'Kovačić'))).toBe('MK');
    expect(accountInitials(names('  ana ', ' barić '))).toBe('AB');
    // Surrogate pairs stay intact (the reason for the spread, not [0]).
    expect(accountInitials(names('Đurđa', 'Šarić'))).toBe('ĐŠ');
    expect(accountInitials(names('Marko', ''))).toBe('M');
  });

  it('renders "{First name} {L}." the way the footer draws it', () => {
    expect(accountShortName(names('Marko', 'Kovačić'))).toBe('Marko K.');
    expect(accountShortName(names('ana', 'barić'))).toBe('ana B.');
    expect(accountShortName(names('Marko', ''))).toBe('Marko');
  });
});

describe('account store (RUN-59)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('loads the signed-in identity from the API', async () => {
    seedAccount({ firstName: 'Ana', lastName: 'Anić', email: 'ana@example.com' });
    // seedAccount primes the cache; re-arm so mounting walks the real load
    // path against the seeded backend.
    __resetAccountStoreForTests();

    render(React.createElement(AccountProbe));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('name')).toHaveTextContent('Ana');
    expect(screen.getByTestId('email')).toHaveTextContent('ana@example.com');
    expect(getAccountRecord()?.lastName).toBe('Anić');
  });

  it('answers a signed-out visitor without the network', async () => {
    clearTestSession();
    __resetAccountStoreForTests();

    render(React.createElement(AccountProbe));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(getAccountRecord()).toBeNull();
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('lands in the error state when the load fails, keeping the last good record', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    makeAccountLoadFail(500);

    render(React.createElement(AccountProbe));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    expect(screen.getByTestId('error')).toHaveTextContent(/failed \(500\)/);
    consoleError.mockRestore();
  });

  it('saveAccountDetails stores the new identity and publishes it', async () => {
    await saveAccountDetails({
      firstName: 'Ana',
      lastName: 'Horvat',
      email: 'Ana.Horvat@Example.com',
    });

    render(React.createElement(AccountProbe));
    expect(screen.getByTestId('name')).toHaveTextContent('Ana');
    // The server normalizes the login credential; the store shows what was
    // actually stored, not what was typed.
    expect(screen.getByTestId('email')).toHaveTextContent('ana.horvat@example.com');
  });

  it('saveAccountDetails rejects a taken email with a message the form can show', async () => {
    failAccountApi(409);

    await expect(
      saveAccountDetails({ firstName: 'Ana', lastName: 'Horvat', email: 'taken@example.com' }),
    ).rejects.toThrow(/already used by another account/);

    // Nothing pretended to be saved.
    restoreAccountApi();
    expect(getAccountRecord()?.email).not.toBe('taken@example.com');
  });
});
