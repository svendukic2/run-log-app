import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeEventsLoadFail, restoreEventsApi } from '@/test/eventsApiMock';
import { expireRunsTokens } from '@/test/runsApiMock';
import EventsBoundary from './EventsBoundary';

function renderBoundary() {
  return render(
    <EventsBoundary>
      <div data-testid="events-child" />
    </EventsBoundary>,
  );
}

describe('EventsBoundary (the RUN-48 screen gate for events)', () => {
  it('renders the children once the store is ready', async () => {
    renderBoundary();

    expect(await screen.findByTestId('events-child')).toBeInTheDocument();
  });

  it('withholds the children behind one retryable error card', async () => {
    const user = userEvent.setup();
    makeEventsLoadFail(500);
    renderBoundary();

    expect(await screen.findByRole('alert')).toHaveTextContent("Events didn't load");
    expect(screen.queryByTestId('events-child')).not.toBeInTheDocument();

    restoreEventsApi();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('events-child')).toBeInTheDocument();
  });

  it('drops the retry button for terminal session failures', async () => {
    // An expired token 401s the load and signs the user out (RUN-58 AC6:
    // there is no refresh endpoint). Anything rendered before the sign-in
    // navigation lands must not offer a Try again that fails identically
    // forever.
    expireRunsTokens();
    makeEventsLoadFail(500); // re-arms the load; the 401 fires before the GET

    renderBoundary();

    const card = await screen.findByRole('alert');
    expect(card).toHaveTextContent('Your session has expired. Sign in again.');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
