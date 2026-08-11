// Adds custom DOM matchers (e.g. toBeInTheDocument, toHaveTextContent) to expect().
import '@testing-library/jest-dom';
import { installEventsApiMock } from './src/test/eventsApiMock';
import { installRunsApiMock } from './src/test/runsApiMock';

// The runs store talks to /api/runs since RUN-48 and the events store to
// /api/events since RUN-68; every test gets fresh in-memory backends and
// stores primed to ready-and-empty, mirroring the blank localStorage the
// old stores woke up in. One fetch mock serves both (runsApiMock installs
// it and delegates /api/events); see src/test/runsApiMock.ts.
beforeEach(() => {
  installRunsApiMock();
  installEventsApiMock();
});
