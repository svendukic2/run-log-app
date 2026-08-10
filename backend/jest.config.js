// Unit test config (moved out of package.json so the Prisma workarounds in
// jest.shared.js can carry comments - JSON cannot).
const shared = require('./jest.shared');

module.exports = {
  ...shared,
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  collectCoverageFrom: ['**/*.(t|j)s', '!generated/**'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
