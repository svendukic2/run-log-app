import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { __resetAccountStoreForTests } from '@/lib/account';
import { seedAccount } from '@/test/runsApiMock';
import DashboardGreeting from './DashboardGreeting';

describe('DashboardGreeting (RUN-16)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('greets a morning visitor by first name (AC1)', () => {
    jest.setSystemTime(new Date(2026, 7, 3, 9, 0, 0));
    seedAccount({ firstName: 'Marko' });

    render(<DashboardGreeting />);

    expect(screen.getByText('Good morning, Marko')).toBeInTheDocument();
  });

  it('switches to the afternoon variant (AC2)', () => {
    jest.setSystemTime(new Date(2026, 7, 3, 14, 0, 0));
    seedAccount({ firstName: 'Marko' });

    render(<DashboardGreeting />);

    expect(screen.getByText('Good afternoon, Marko')).toBeInTheDocument();
  });

  it('switches to the evening variant (AC2)', () => {
    jest.setSystemTime(new Date(2026, 7, 3, 20, 0, 0));
    seedAccount({ firstName: 'Marko' });

    render(<DashboardGreeting />);

    expect(screen.getByText('Good evening, Marko')).toBeInTheDocument();
  });

  it('greets without a name while the account is still unknown', () => {
    jest.setSystemTime(new Date(2026, 7, 3, 9, 0, 0));
    // The identity comes from the account store since RUN-59; with nothing
    // cached the greeting drops the name rather than inventing one.
    __resetAccountStoreForTests(null);

    render(<DashboardGreeting />);

    expect(screen.getByText('Good morning')).toBeInTheDocument();
  });

  it('uses the new first name on the next render (AC3)', () => {
    jest.setSystemTime(new Date(2026, 7, 3, 9, 0, 0));
    seedAccount({ firstName: 'Marko' });

    const { unmount } = render(<DashboardGreeting />);
    expect(screen.getByText('Good morning, Marko')).toBeInTheDocument();

    // "Renders again" per the AC: the next visit to the Dashboard mounts a
    // fresh instance, which re-reads the account cache.
    unmount();
    seedAccount({ firstName: 'Ana' });
    render(<DashboardGreeting />);

    expect(screen.getByText('Good morning, Ana')).toBeInTheDocument();
  });

  it('renders nothing on the server, where clock and account are unknown', () => {
    jest.setSystemTime(new Date(2026, 7, 3, 9, 0, 0));
    seedAccount({ firstName: 'Marko' });

    // The pre-hydration markup must carry no clock- or store-derived text,
    // otherwise the client hydration pass could disagree with it.
    expect(renderToString(<DashboardGreeting />)).not.toMatch(/Good/);
  });
});
