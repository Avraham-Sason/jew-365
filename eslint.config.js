// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

const jestGlobals = {
  jest: 'readonly',
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
};

const nodeGlobals = {
  __dirname: 'readonly',
  __filename: 'readonly',
  process: 'readonly',
  require: 'readonly',
  module: 'writable',
  console: 'readonly',
};

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: [
      'dist/*',
      '.expo/*',
      'android/*',
      'ios/*',
      'coverage/*',
      'design/*',
      'docs/*',
      '.claude/*',
      '.agents/*',
      'src/data/siddurAssets.generated.ts',
    ],
  },
  {
    files: ['scripts/**/*.js', '*.config.js', 'index.js'],
    languageOptions: { globals: nodeGlobals },
  },
  {
    // jest.mock factories run before the imports they replace, so the hoisted-mock pattern needs
    // `require` inside the factory and imports below the mocks.
    files: ['**/__tests__/**', '**/*.test.*', '__mocks__/**', 'scripts/jest-*.js', 'src/testing/**'],
    languageOptions: { globals: { ...jestGlobals, ...nodeGlobals } },
    rules: {
      'import/first': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
