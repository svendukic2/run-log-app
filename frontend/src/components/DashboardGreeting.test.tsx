import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { saveProfile } from '@/lib/onboarding';
import DashboardGreeting from './DashboardGreeting';

function profileNamed(firstName: string) {
  return { firstName, lastName: 'K.', email: 'marko@email.com' };
}

describe('DashboardGreeting (RUN-16)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('greets a morning visitor by first name (AC1)', () => {
    jest.setSystemTime(new Date(2026, 7, 3, 9, 0, 0));
    saveProfile(profileNamed('Marko'));

    render(<DashboardGreeting />);

    expect(screen.getByText('Good morning, Marko')).toBeInTheDocument();
  });

  it('switches to the afternoon variant (AC2)', () => {
    jest.setSystemTime(new Date(2026, 7, 3, 14, 0, 0));
    saveProfile(profileNamed('Marko'));

    render(<DashboardGreeting />);

    expect(screen.getByText('Good afternoon, Marko')).toBeInTheDocument();
  });

  it('switches to the evening variant (AC2)', () => {
    jest.setSystemTime(new Date(2026, 7, 3, 20, 0, 0));
    saveProfile(profileNamed('Marko'));

    render(<DashboardGreeting />);

    expect(screen.getByText('Good evening, Marko')).toBeInTheDocument();
  });

  it('greets without a name when no profile is stored yet', () => {
    jest.setSystemTime(new Date(2026, 7, 3, 9, 0, 0));

    render(<DashboardGreeting />);

    expect(screen.getByText('Good morning')).toBeInTheDocument();
  });

  it('uses the new first name on the next render (AC3)', () => {
    jest.setSystemTime(new Date(2026, 7, 3, 9, 0, 0));
    saveProfile(profileNamed('Marko'));

    const { unmount } = render(<DashboardGreeting />);
    expect(screen.getByText('Good morning, Marko')).toBeInTheDocument();

    // "Renders again" per the AC: the next visit to the Dashboard mounts a
    // fresh instance, which re-reads the stored profile.
    unmount();
    saveProfile(profileNamed('Ana'));
    render(<DashboardGreeting />);

    expect(screen.getByText('Good morning, Ana')).toBeInTheDocument();
  });

  it('renders nothing on the server, where clock and profile are unknown', () => {
    jest.setSystemTime(new Date(2026, 7, 3, 9, 0, 0));
    saveProfile(profileNamed('Marko'));

    // The pre-hydration markup must carry no clock- or storage-derived text,
    // otherwise the client hydration pass could disagree with it.
    expect(renderToString(<DashboardGreeting />)).not.toMatch(/Good/);
  });
});
