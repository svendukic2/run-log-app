import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { todayIso } from '@/lib/goal';
import { getOnboardingDraft, saveDraftGoal } from '@/lib/onboarding';
import { seedAccount } from '@/test/runsApiMock';
import WeeklyGoalPage from './page';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
}));

function isoDaysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// The step's output is the wizard DRAFT since RUN-50: nothing reaches the
// server until "Finish setup" on the next step.
function draftGoal() {
  return getOnboardingDraft().goal;
}

describe('Weekly goal step (RUN-8 / RUN-9)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows Step 1 of 2, the Welcome badge with the account's first name and the heading", () => {
    // The badge greets from the ACCOUNT since RUN-59, so setup resumed on
    // another device still knows the runner's name.
    seedAccount({ firstName: 'Marko', lastName: 'Horvat', email: 'marko@email.com' });

    render(<WeeklyGoalPage />);

    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Welcome, Marko')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /how far do you want to run each week\?/i }),
    ).toBeInTheDocument();
  });

  it('defaults the readout to 20 km / week', () => {
    render(<WeeklyGoalPage />);

    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('km / week')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveValue('20');
  });

  it('updates the readout and the slider together when the stepper is clicked', async () => {
    const user = userEvent.setup();
    render(<WeeklyGoalPage />);

    await user.click(screen.getByRole('button', { name: 'Increase weekly goal' }));
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveValue('21');

    await user.click(screen.getByRole('button', { name: 'Decrease weekly goal' }));
    await user.click(screen.getByRole('button', { name: 'Decrease weekly goal' }));
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveValue('19');
  });

  it('matches the readout and stepper value to the slider when it moves', () => {
    render(<WeeklyGoalPage />);

    fireEvent.change(screen.getByRole('slider'), { target: { value: '35' } });

    expect(screen.getByText('35')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveValue('35');
  });

  it('clamps the value to the 0-60 km scale', async () => {
    const user = userEvent.setup();
    render(<WeeklyGoalPage />);

    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } });
    await user.click(screen.getByRole('button', { name: 'Decrease weekly goal' }));
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveValue('0');

    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } });
    await user.click(screen.getByRole('button', { name: 'Increase weekly goal' }));
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveValue('60');
  });

  it('shows the 0 / 30 / 60 km slider scale', () => {
    render(<WeeklyGoalPage />);

    expect(screen.getByText('0 km')).toBeInTheDocument();
    expect(screen.getByText('30 km')).toBeInTheDocument();
    expect(screen.getByText('60 km')).toBeInTheDocument();
  });

  it('renders no sidebar, onboarding sits outside the app shell (RUN-13 AC4)', () => {
    render(<WeeklyGoalPage />);

    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
  });
});

describe('Goal dates and step navigation (RUN-10)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockClear();
  });

  it('prefills the start date with today and shows "No end date"', () => {
    render(<WeeklyGoalPage />);

    expect(screen.getByLabelText('Start date')).toHaveValue(todayIso());
    expect(screen.getByText('No end date')).toBeInTheDocument();
  });

  it('shows an inline message and does not save when the end date is before the start date', async () => {
    const user = userEvent.setup();
    render(<WeeklyGoalPage />);

    fireEvent.change(screen.getByLabelText('End date (optional)'), {
      target: { value: isoDaysFromToday(-3) },
    });
    await user.click(screen.getByRole('button', { name: /start tracking/i }));

    expect(screen.getByText('End date must be on or after the start date')).toBeInTheDocument();
    expect(draftGoal()).toBeUndefined();
    expect(push).not.toHaveBeenCalled();
  });

  it('drafts the goal and opens Setup - Running level on Start tracking', async () => {
    const user = userEvent.setup();
    render(<WeeklyGoalPage />);

    fireEvent.change(screen.getByRole('slider'), { target: { value: '35' } });
    fireEvent.change(screen.getByLabelText('End date (optional)'), {
      target: { value: isoDaysFromToday(14) },
    });
    await user.click(screen.getByRole('button', { name: /start tracking/i }));

    expect(draftGoal()).toEqual({
      km: 35,
      startDate: todayIso(),
      endDate: isoDaysFromToday(14),
    });
    expect(push).toHaveBeenCalledWith('/setup/level');
  });

  it('keeps the default 20 km and opens step 03 on Skip for now', async () => {
    const user = userEvent.setup();
    render(<WeeklyGoalPage />);

    fireEvent.change(screen.getByRole('slider'), { target: { value: '33' } });
    await user.click(screen.getByRole('button', { name: 'Skip for now' }));

    expect(draftGoal()).toEqual({ km: 20, startDate: todayIso(), endDate: null });
    expect(push).toHaveBeenCalledWith('/setup/level');
  });

  it('keeps values entered earlier when returning from step 03 (RUN-11 AC4)', () => {
    saveDraftGoal({
      km: 42,
      startDate: isoDaysFromToday(1),
      endDate: isoDaysFromToday(21),
    });

    render(<WeeklyGoalPage />);

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveValue('42');
    expect(screen.getByLabelText('Start date')).toHaveValue(isoDaysFromToday(1));
    expect(screen.getByLabelText('End date (optional)')).toHaveValue(isoDaysFromToday(21));
  });
});
