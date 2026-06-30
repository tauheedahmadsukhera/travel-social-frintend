/**
 * apiService Unit Tests
 *
 * Tests circuit breaking, request deduplication, retry logic, and interceptor
 * error handling. Uses jest.resetModules() + require() inside beforeEach so
 * each test starts with a completely fresh module registry — this is the only
 * reliable way to test module-level singletons in Jest.
 */

// All mocks are declared at the top level so Jest hoists them correctly.
jest.mock('axios');
jest.mock('@/lib/storage');
jest.mock('../../../config/environment', () => ({
  getAPIBaseURL: jest.fn(() => 'https://api.test.com'),
}));

describe('apiService', () => {
  let axiosInstanceMock: any;
  let apiService: any;
  let mockedAxios: any;
  let mockedAsyncStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset modules so the lazy singleton (axiosInstance) is rebuilt fresh.
    jest.resetModules();

    // Re-require mocked dependencies AFTER resetModules so we get the fresh
    // instances that the re-required apiService will also see.
    mockedAxios = require('axios');
    mockedAsyncStorage = require('@/lib/storage').default;

    // Build a callable mock that also exposes .interceptors
    axiosInstanceMock = jest.fn();
    axiosInstanceMock.interceptors = {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    };

    mockedAxios.create.mockReturnValue(axiosInstanceMock);

    // Re-require apiService after setting up the axios mock
    apiService = require('../apiService').default;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Circuit Breaker
  // ---------------------------------------------------------------------------
  describe('Circuit Breaker', () => {
    it('should open the circuit after multiple consecutive failures', async () => {
      const networkError = { code: 'ERR_NETWORK', message: 'Network Error' };
      axiosInstanceMock.mockRejectedValue(networkError);

      // Exhaust 6 full request cycles (each with up to 3 retries)
      for (let i = 0; i < 6; i++) {
        const promise = apiService.get('/test-circuit');
        // Flush retries: each retry waits on a setTimeout
        for (let attempt = 0; attempt < 4; attempt++) {
          await Promise.resolve();
          jest.runAllTimers();
          await Promise.resolve();
        }
        await expect(promise).rejects.toBeDefined();
      }

      // Circuit should now be OPEN — next call rejected immediately
      await expect(apiService.get('/test-circuit')).rejects.toMatchObject({
        code: 'CIRCUIT_OPEN',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Request Deduplication
  // ---------------------------------------------------------------------------
  describe('Request Deduplication', () => {
    it('should deduplicate concurrent GET requests to the same URL', async () => {
      axiosInstanceMock.mockResolvedValue({ data: { success: true, data: 'result' } });

      const promise1 = apiService.get('/dedupe');
      const promise2 = apiService.get('/dedupe');

      const [res1, res2] = await Promise.all([promise1, promise2]);

      expect(res1).toEqual(res2);
      // Only one network call should have been made
      expect(axiosInstanceMock).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Retry Logic
  // ---------------------------------------------------------------------------
  describe('Retry Logic', () => {
    it('should retry on network errors and resolve on success', async () => {
      const networkError = { code: 'ERR_NETWORK', message: 'Network Error' };
      const successResponse = { data: { success: true, data: 'finally' } };

      axiosInstanceMock
        .mockRejectedValueOnce(networkError)  // attempt 1 → fail
        .mockRejectedValueOnce(networkError)  // attempt 2 → fail
        .mockResolvedValueOnce(successResponse); // attempt 3 → success

      const promise = apiService.get('/retry-test');

      // Flush timers + promises for each retry cycle
      // runAllTimersAsync() advances ALL pending timers AND awaits any
      // resulting promises — safe for deeply nested async retry chains.
      await jest.runAllTimersAsync();
      await jest.runAllTimersAsync();

      const result = await promise;
      expect(result.data).toBe('finally');
      expect(axiosInstanceMock).toHaveBeenCalledTimes(3);
    }, 15000); // 15s timeout for async timer chains
  });

  // ---------------------------------------------------------------------------
  // Interceptors
  // ---------------------------------------------------------------------------
  describe('Interceptors', () => {
    it('should clear storage and reject on 401 Unauthorized', async () => {
      // Warm up the lazy axios singleton
      axiosInstanceMock.mockResolvedValue({ data: { success: true } });
      await apiService.get('/dummy');

      const responseUse = axiosInstanceMock.interceptors.response.use;
      expect(responseUse).toHaveBeenCalled();

      // Extract the error handler (second argument to .use())
      const [, errorHandler] = responseUse.mock.calls[0];

      const error401 = { response: { status: 401 } };
      await expect(errorHandler(error401)).rejects.toEqual(error401);

      expect(mockedAsyncStorage.multiRemove).toHaveBeenCalledWith(['token', 'userId']);
    });
  });
});
