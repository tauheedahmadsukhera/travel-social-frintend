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
  ],
};
