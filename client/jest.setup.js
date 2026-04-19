import '@testing-library/jest-native/extend-expect';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock Firebase
jest.mock('./config/firebase', () => ({
  auth: { currentUser: null },
  db: {},
  storage: { app: { options: { storageBucket: 'test-bucket' } } },
}));

// Mock Expo modules
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
  useSegments: jest.fn(() => []),
  Stack: { Screen: 'Screen' },
}));

jest.mock('expo-constants', () => ({
  expoConfig: { extra: {} },
  manifest: {},
  manifest2: {},
}));

jest.mock('expo-font', () => ({
  loadAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn((uri) => Promise.resolve({ uri: 'optimized-' + uri })),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

// SDKs differ on whether this module path exists; mock the main module.
jest.mock('expo-file-system', () => ({
  cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: true, size: 1024 * 1024 })),
  readAsStringAsync: jest.fn(() => Promise.resolve('base64-data')),
  copyAsync: jest.fn(() => Promise.resolve()),
  downloadAsync: jest.fn((_url, dest) => Promise.resolve({ status: 200, uri: dest })),
}));

jest.mock('firebase/storage', () => ({
  ref: jest.fn((_storage, path) => ({ path })),
  getDownloadURL: jest.fn(async () => 'https://cdn.example.com/1.jpg'),
  deleteObject: jest.fn(async () => undefined),
}));

// Polyfills
if (typeof global.atob === 'undefined') {
  global.atob = (data) => Buffer.from(data, 'base64').toString('binary');
}
if (typeof global.fetch === 'undefined') {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
}

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
  addEventListener: jest.fn(() => jest.fn()),
}));

// Silence console warnings during tests
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
};
