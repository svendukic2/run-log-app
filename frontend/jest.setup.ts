// Adds custom DOM matchers (e.g. toBeInTheDocument, toHaveTextContent) to expect().
import '@testing-library/jest-dom';
import { installEventsApiMock } from './src/test/eventsApiMock';
import { installLeaderboardApiMock } from './src/test/leaderboardApiMock';
import { installNotificationsApiMock } from './src/test/notificationsApiMock';
import { installRunsApiMock } from './src/test/runsApiMock';
import { installUsersApiMock } from './src/test/usersApiMock';

// The runs store talks to /api/runs since RUN-48, the events store to
// /api/events since RUN-68, the notifications bell to /api/me/notifications
// since RUN-66, the global leaderboard to /api/leaderboard since RUN-70 and
// the public profile to /api/users/:id since RUN-63 and the People search to
// /api/users?search= since RUN-62; every test gets fresh
// in-memory backends and stores primed to ready-and-empty, mirroring the
// blank localStorage the old stores woke up in. One fetch mock serves them
// all (runsApiMock installs it and delegates); see src/test/runsApiMock.ts.
beforeEach(() => {
  installRunsApiMock();
  installEventsApiMock();
  installNotificationsApiMock();
  installLeaderboardApiMock();
  installUsersApiMock();
});
