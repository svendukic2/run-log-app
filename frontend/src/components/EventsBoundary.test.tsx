import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeEventsLoadFail, restoreEventsApi } from '@/test/eventsApiMock';
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
});
