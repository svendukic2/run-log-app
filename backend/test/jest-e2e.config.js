// E2e test config (moved out of jest-e2e.json so the Prisma workarounds in
// ../jest.shared.js can carry comments - JSON cannot).
const shared = require('../jest.shared');

module.exports = {
  ...shared,
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',
};
