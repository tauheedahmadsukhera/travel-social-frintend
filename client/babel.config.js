module.exports = function(api) {
  api.cache(true);


  const plugins = [
    ['module-resolver', {
      root: ['./'],
      alias: {
        '@': './',
      },
    }],
    'react-native-reanimated/plugin'
  ];

  // Remove console.log everywhere (keep error/warn); massively improves scroll perf in dev
  if (process.env.NODE_ENV !== 'test') {
    plugins.unshift(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  }

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};