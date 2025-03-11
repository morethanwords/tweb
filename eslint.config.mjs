import typescriptEslint from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import js from '@eslint/js';
import {FlatCompat} from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
});

export default [{
  ignores: [
    'src/vendor/**/*',
    'src/solid/**/*',
    'src/opus-recorder/**/*',
    'public/**/*'
  ]
}, ...compat.extends(), {
  plugins: {
    '@typescript-eslint': typescriptEslint
  },

  languageOptions: {
    globals: {
      ...globals.browser
    },

    parser: tsParser,
    ecmaVersion: 'latest',
    sourceType: 'module',

    parserOptions: {
      project: ['./tsconfig.json']
    }
  },

  rules: {
    'max-len': 'off',

    'keyword-spacing': ['error', {
      after: true,

      overrides: {
        if: {
          before: true,
          after: false
        },

        else: {
          before: true
        },

        catch: {
          before: true,
          after: false
        },

        for: {
          after: false
        },

        while: {
          after: false
        },

        switch: {
          after: false
        }
      }
    }],

    'linebreak-style': ['error', 'unix'],
    'eol-last': 'error',

    'indent': ['error', 2, {
      CallExpression: {
        arguments: 1
      },

      FunctionDeclaration: {
        body: 1,
        parameters: 1
      },

      FunctionExpression: {
        body: 1,
        parameters: 1
      },

      MemberExpression: 0,
      ObjectExpression: 1,
      SwitchCase: 1,
      ignoredNodes: ['ConditionalExpression']
    }],

    'space-before-function-paren': ['error', 'never'],
    'prefer-promise-reject-errors': 'off',
    'curly': 'off',
    'comma-dangle': ['error', 'never'],
    'comma-spacing': 'error',
    'comma-style': 'error',
    'quote-props': ['error', 'consistent'],

    'quotes': ['error', 'single', {
      allowTemplateLiterals: true
    }],

    'space-before-blocks': ['error', 'always'],
    'spaced-comment': ['error', 'always'],
    'prefer-spread': 'off',

    'prefer-const': ['error', {
      destructuring: 'all'
    }],

    'object-curly-spacing': ['error', 'never'],
    'array-bracket-spacing': ['error', 'never'],
    'switch-colon-spacing': 'error',
    'operator-linebreak': ['error', 'after'],
    'padded-blocks': ['error', 'never'],
    'no-useless-call': 'error',
    'no-trailing-spaces': 'error',
    'no-mixed-spaces-and-tabs': 'error',

    'no-multiple-empty-lines': ['error', {
      max: 2
    }],

    'no-tabs': 'error',
    'no-multi-str': 'error',
    'no-new-wrappers': 'error',

    'no-irregular-whitespace': ['error', {
      skipStrings: true,
      skipComments: true,
      skipRegExps: true,
      skipTemplates: true
    }],

    'no-unexpected-multiline': 'error',
    'no-return-await': 'error',
    '@typescript-eslint/await-thenable': 'error'
  }
}, {
  files: ['**/*.ts', '**/*.tsx'],

  languageOptions: {
    ecmaVersion: 5,
    sourceType: 'script',

    parserOptions: {
      project: ['./tsconfig.json']
    }
  }
}];
