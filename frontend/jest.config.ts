import type { Config } from 'jest';
import nextJest from 'next/jest.js';

// next/jest wires the Next.js SWC compiler into Jest, loads next.config and
// .env files, and stubs CSS / static asset imports so component tests run
// without extra transform config.
// Docs: https://nextjs.org/docs/app/guides/testing/jest
const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // Leaflet (RUN-54) never runs for real under Jest: it wants a laid-out
    // container, tiles over the network and a `window` with dimensions, none
    // of which jsdom has. The stub records what the picker drew and lets tests
    // fire map and marker events, so the component's wiring is still the thing
    // under test. See src/test/leafletMock.ts for why this is mapped globally
    // rather than mocked per test.
    '^leaflet$': '<rootDir>/src/test/leafletMock.ts',
  },
};

export default createJestConfig(config);
