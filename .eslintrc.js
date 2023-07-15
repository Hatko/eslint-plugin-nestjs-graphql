module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    sourceType: 'module',
  },
  plugins: [
    '@typescript-eslint/eslint-plugin',
    'eslint-plugin-import',
  ],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
  ],
  settings: {
    'import/resolver': {
      typescript: true,
      node: true,
    }
  },
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    'no-duplicate-imports': 'error',
    'no-return-await': 'error',
    'require-await': 'error',
    'no-param-reassign': 'error',
    'object-shorthand': 'error',
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    "import/no-extraneous-dependencies": [
      "error",
      {
        "devDependencies": false,
        "optionalDependencies": false,
        "peerDependencies": false,
      }
    ],
    '@typescript-eslint/no-unsafe-argument': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unnecessary-condition': 'error',
    'no-console': ['warn', { allow: ['error', 'warn'] }],
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: 'function',
        format: ['PascalCase', 'camelCase'],
      },
      {
        selector: 'typeAlias',
        format: ['PascalCase'],
      },
    ],
  },
  overrides: [
    {
      files: ['script/**/*.ts'],
      rules: {
        "import/no-extraneous-dependencies": [
          "error",
          {
            // Script files can use devDependencies
            "devDependencies": true,
            "optionalDependencies": false,
            "peerDependencies": false,
          }
        ],
      },
    },
  ]
}
