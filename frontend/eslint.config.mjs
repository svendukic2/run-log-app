import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  {
    // session.ts sits at the bottom of the lib import graph (everything
    // that calls apiFetch imports it). The stores above it re-export the
    // onboardingDraft leaf, and importing that surface from here would
    // close an import cycle - this rule keeps autocomplete honest (RUN-50).
    files: ['src/lib/session.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: './onboarding',
              message:
                'session.ts must not import the profile store (import cycle). The wizard draft lives in ./onboardingDraft, a leaf.',
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
