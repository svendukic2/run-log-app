import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WeeklyGoalPage from './page';

function storedProfile() {
  window.localStorage.setItem(
    'runlog.profile',
    JSON.stringify({ firstName: 'Marko', lastName: 'Horvat', email: 'marko@email.com' }),
  );
}

describe('Weekly goal step (RUN-8 / RUN-9)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows Step 1 of 2, the Welcome badge with the first name and the heading', () => {
    storedProfile();

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
