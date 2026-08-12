// Shared between jest.config.js (unit) and test/jest-e2e.config.js (e2e) so
// the two cannot rot out of sync. Everything in this file exists to make
// Prisma 7's generated client load under Jest; docs/data-model.md has the
// long-form story. Delete the whole file the day the generated client loads
// cleanly under Jest's default CommonJS environment.
//
// RE-TESTED at Prisma 7.9.1 (prisma and @prisma/client both 7.9.1, RUN-79
// item 10), by removing this config and running the unit suite. It is still
// needed, and BOTH halves are: 13 of 29 suites failed, which is every suite
// that reaches PrismaService.
//
//   - With neither half: "Cannot find module './internal/class.js' from
//     'generated/prisma/client.ts'" - the generated client's ESM-style
//     relative specifiers, exactly what moduleNameMapper below rewrites.
//   - With moduleNameMapper but WITHOUT the tsconfig override: the same 13
//     suites fail differently, resolving class-validator to
//     node_modules/src/index.ts and dying inside libphonenumber-js's .cjs
//     entry. The `.js` mapping is global, so under the app's nodenext
//     resolution it reaches third-party packages too; node10 +
//     resolvePackageJsonExports: false is what keeps that rewrite confined
//     to a resolution mode that can take it.
//
// So the next person should not re-run the experiment before Prisma 8, or
// before the generated client stops shipping those specifiers.
module.exports = {
  // The generated client loads its WASM query compiler with a dynamic
  // import(), which the app's nodenext tsconfig keeps as a real import()
  // and Jest's CommonJS VM then rejects with:
  //   "A dynamic import callback was invoked without --experimental-vm-modules"
  // Compiling tests as module: commonjs makes tsc downlevel that import()
  // to a require() of what is (verifiably) a CJS file. The node10 +
  // resolvePackageJsonExports pair is required for module: commonjs to be
  // a legal tsconfig; the cost is that tests resolve modules under older
  // rules than the production build - the CI build step and the e2e run
  // against real Postgres keep that divergence honest.
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node10',
          resolvePackageJsonExports: false,
        },
      },
    ],
  },
  // The generated client uses ESM-style relative specifiers ("./enums.js")
  // that fail under CJS resolution with "Cannot find module './enums.js'".
  // WARNING: this mapping is global - it rewrites EVERY relative .js import
  // in the test suite, not just Prisma's. Today nothing else imports a
  // relative .js path; if something ever does and resolves strangely in
  // tests, this line is why.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
