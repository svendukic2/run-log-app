// E2e test config (moved out of jest-e2e.json so the Prisma workarounds in
// ../jest.shared.js can carry comments - JSON cannot).
const shared = require('../jest.shared');

module.exports = {
  ...shared,
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',
  // The suite runs against a dedicated <name>_test database: global-setup
  // creates and migrates it once, e2e-env points every worker's
  // DATABASE_URL at it, and test-database.ts refuses anything else. The
  // tests delete rows between cases, so this separation is what keeps
  // `npm run test:e2e` from eating a developer's real data.
  globalSetup: '<rootDir>/global-setup.ts',
  setupFiles: ['<rootDir>/e2e-env.ts'],
  // One worker, on purpose: every e2e file shares the single _test database
  // and wipes tables between cases, so parallel workers would eat each
  // other's rows and fail intermittently.
  maxWorkers: 1,
};
