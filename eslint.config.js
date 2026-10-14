// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');
const globals = require('globals');

const banClock = {
  selector:
    "CallExpression[callee.object.name='Date'][callee.property.name='now'], NewExpression[callee.name='Date'][arguments.length=0]",
  message: 'Use the injected clock (src/shared/clock.ts) instead of Date.now() / new Date().',
};

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: [
      'dist/*',
      'node_modules/*',
      '.expo/*',
      'coverage/*',
      'test-results/*',
      'playwright-report/*',
      'public/*',
      'uploads/*',
    ],
  },
  {
    files: ['**/*.{ts,tsx,js}'],
    rules: {
      'no-restricted-syntax': ['error', banClock],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/shared/clock.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'react-native*', 'expo', 'expo-*', '@shopify/*'],
              message: 'src/domain must stay platform-independent.',
            },
            {
              group: ['@/data/*', '@/features/*', '@/ui/*', '@/app/*'],
              message: 'src/domain must not depend on outer layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/data/db/*',
                '!@/data/db/client',
                '@/data/media/*',
                '!@/data/media/types',
                '@/data/services',
                '@/data/repos/context',
              ],
              message: 'UI code goes through AppData (useAppData); do not reach into the driver or storage.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', 'e2e/**/*.ts', 'scripts/**/*.js', '*.config.js'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.test.ts'],
    rules: { 'import/no-named-as-default-member': 'off' },
  },
  {
    files: ['scripts/**/*.js', '*.config.js', 'jest.setup.js'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: { 'expo/no-dynamic-env-var': 'off' },
  },
]);
