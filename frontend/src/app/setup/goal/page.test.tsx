import { render, screen } from '@testing-library/react';
import WeeklyGoalPage from './page';

describe('Weekly goal step badge (RUN-8)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('reads "Welcome, {first name}" when a profile is stored', () => {
    window.localStorage.setItem(
      'runlog.profile',
      JSON.stringify({ firstName: 'Marko', lastName: 'Horvat', email: 'marko@email.com' }),
    );

    render(<WeeklyGoalPage />);

    expect(screen.getByText('Welcome, Marko')).toBeInTheDocument();
  });
});
