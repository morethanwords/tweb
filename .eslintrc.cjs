module.exports = {
  root: true,
  env: {node: true, browser: true, es2021: true, jest: true},
  parserOptions: {ecmaVersion: 2022, sourceType: 'module'},
  extends: ['eslint:recommended'],
  rules: {'no-unused-vars': ['error', {argsIgnorePattern: '^_'}]},
  overrides: [{
    files: ['*.ts'],
    parser: '@typescript-eslint/parser',
    // TypeScript checks names/types; core ESLint cannot distinguish type positions.
    rules: {'no-undef': 'off', 'no-unused-vars': 'off'}
  }]
};
