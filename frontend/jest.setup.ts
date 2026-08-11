// Adds custom DOM matchers (e.g. toBeInTheDocument, toHaveTextContent) to expect().
import '@testing-library/jest-dom';
import { installRunsApiMock } from './src/test/runsApiMock';

// The runs store talks to /api/runs since RUN-48; every test gets a fresh
// in-memory backend and a store primed to ready-and-empty, mirroring the
// blank localStorage the old store woke up in. See src/test/runsApiMock.ts.
beforeEach(() => {
  installRunsApiMock();
});
