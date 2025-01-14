// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin'

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.strict,
  // tseslint.configs.stylistic,
  stylistic.configs['recommended-flat'],
  {
    plugins: {
      '@stylistic': stylistic
    },
    rules: {
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/brace-style': ['warn', '1tbs'],
      '@stylistic/member-delimiter-style': ['error', {
        multiline: {
          delimiter: 'semi'
        }
      }]
    }
  }
);
