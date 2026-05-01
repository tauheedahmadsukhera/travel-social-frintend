// https://docs.expo.dev/guides/using-eslint/
// Use legacy eslintrc with eslint@8 (flat eslint.config.js needs eslint@9 + eslint/config).
module.exports = {
  extends: 'expo',
  rules: {
    // react-native-dotenv / babel provides this module at build time
    'import/no-unresolved': ['error', { ignore: ['^@env$'] }],
  },
  ignorePatterns: [
    'dist/**',
    'node_modules/**',
    '.expo/**',
    'admin/**',
    'functions/**',
    '**/*.generated.ts',
    'android/**',
    'ios/**',
  ],
  overrides: [
    {
      files: ['scripts/**/*.js', '*.js', '__tests__/**/*.js', 'jest.setup.js'],
      env: {
        node: true,
        jest: true,
      },
      rules: {
        'no-undef': 'off',
        'expo/no-dynamic-env-var': 'off',
      },
    },
  ],
};
