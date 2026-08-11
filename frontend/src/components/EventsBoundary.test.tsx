import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { holdEventsLoading, makeEventsLoadFail, restoreEventsApi } from '@/test/eventsApiMock';
import { breakRunsAuth } from '@/test/runsApiMock';
import EventsBoundary from './EventsBoundary';

function renderBoundary() {
  return render(
    <EventsBoundary>
      <div data-testid="events-child" />
    </EventsBoundary>,
  );
}

describe('EventsBoundary (RUN-68, the RUN-48 screen gate for events)', () => {
  it('renders the children once the store is ready', async () => {
    renderBoundary();

    expect(await screen.findByTestId('events-child')).toBeInTheDocument();
  });

  it('admits the pending state while the load is in flight, children withheld', async () => {
    holdEventsLoading();
    renderBoundary();

    expect(screen.queryByTestId('events-child')).not.toBeInTheDocument();
    // The spinner appears only after the anti-flicker delay.
    expect(await screen.findByRole('status')).toHaveTextContent(/loading events/i);
    expect(screen.queryByTestId('events-child')).not.toBeInTheDocument();
  });

  it('shows one retryable error card and recovers through Try again', async () => {
    const user = userEvent.setup();
    makeEventsLoadFail(500);
    renderBoundary();

    const card = await screen.findByRole('alert');
    expect(card).toHaveTextContent("Events didn't load");
    expect(screen.queryByTestId('events-child')).not.toBeInTheDocument();

    restoreEventsApi();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('events-child')).toBeInTheDocument();
  });

  it('drops the retry button for terminal identity failures', async () => {
    // A device whose identity cannot authenticate (login 401, signup 409:
    // the session layer's terminal case) must get the way-out copy, not a
    // Try again that fails identically forever.
    breakRunsAuth();
    makeEventsLoadFail(500); // re-arms the load; auth fails before the GET

    renderBoundary();

    const card = await screen.findByRole('alert');
    expect(card).toHaveTextContent(/can't sign in/i);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
