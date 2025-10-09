import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: ['dist', 'build', 'coverage', 'node_modules', '*.config.*', 'vercel.json', 'api/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        tsconfigRootDir: rootDir,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
    },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
);
