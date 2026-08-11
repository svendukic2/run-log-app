// Adds custom DOM matchers (e.g. toBeInTheDocument, toHaveTextContent) to expect().
import '@testing-library/jest-dom';
import { installEventsApiMock } from './src/test/eventsApiMock';
import { installNotificationsApiMock } from './src/test/notificationsApiMock';
import { installRunsApiMock } from './src/test/runsApiMock';

// The runs store talks to /api/runs since RUN-48, the events store to
// /api/events since RUN-68 and the notifications bell to
// /api/me/notifications since RUN-66; every test gets fresh in-memory
// backends and stores primed to ready-and-empty, mirroring the blank
// localStorage the old stores woke up in. One fetch mock serves all three
// (runsApiMock installs it and delegates); see src/test/runsApiMock.ts.
beforeEach(() => {
  installRunsApiMock();
  installEventsApiMock();
  installNotificationsApiMock();
});
