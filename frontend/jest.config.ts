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
};

export default createJestConfig(config);
