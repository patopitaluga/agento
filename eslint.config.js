import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['node_modules/**', 'public/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      curly: ['error', 'multi'],
    },
  },
  {
    files: ['**/*.mjs'],
    rules: {
      curly: ['error', 'multi'],
    },
  },
];
