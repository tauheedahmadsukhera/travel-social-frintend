// WeakRef Polyfill for Hermes
import { Ionicons } from '@expo/vector-icons';
import * as Font from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, AppState, LogBox, View } from "react-native";
import AsyncStorage from '@/lib/storage';
import * as SystemUI from 'expo-system-ui';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ErrorBoundary } from "@/src/components/ErrorBoundary";
import { initSentry } from "../lib/sentry";
import { UserProvider } from "../src/components/UserContext";
import { Audio } from 'expo-av';
import { ThemeProvider } from '../lib/theme';
import { disconnectSocket, getSocket, initializeSocket } from '@/src/services/socketService';
import { AppDialogProvider } from '@/src/components/AppDialogProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from '@/store/useAppStore';
// Load location service (foreground passport checks + optional TaskManager shim)
import '@/src/services/locationService';

if (typeof global === 'object' && typeof global.WeakRef === 'undefined') {
  // @ts-ignore
  global.WeakRef = class WeakRef {
    target: any;
    constructor(target: any) { this.target = target; }
    deref() { return this.target; }
  };
}

let setupNotificationListeners: any = () => {};
let initializeBackend: any = () => Promise.resolve();

// Safely load services with error handling
try {
  const notificationModule = require("@/src/services/notificationHandler");
  setupNotificationListeners = notificationModule.setupNotificationListeners || (() => {});
} catch (e) {
  console.warn('[RootLayout] Failed to load notification handler:', e);
}

try {
  const backendModule = require("@/src/services/backendWakeup");
  initializeBackend = backendModule.initializeBackend || (() => Promise.resolve());
} catch (e) {
  console.warn('[RootLayout] Failed to load backend wakeup:', e);
}
// Suppress non-critical warnings
LogBox.ignoreLogs([
  'Unable to activate keep awake',
  'Sending `onAnimatedValueUpdate` with no listeners registered',
  'ViewPropTypes will be removed',
  'Native part of Reanimated doesn\'t seem to be initialized', // Suppress in Expo Go
]);

if (typeof globalThis !== 'undefined' && !(globalThis as any).__traveUnhandledRejectionGuardInstalled) {
  (globalThis as any).__traveUnhandledRejectionGuardInstalled = true;
  (globalThis as any).onunhandledrejection = (event: any) => {
    try {
      const msg = String(event?.reason?.message ?? event?.reason ?? '');
      if (msg.toLowerCase().includes('unable to activate keep awake')) {
        if (typeof event?.preventDefault === 'function') event.preventDefault();
        return;
      }
    } catch {}
  };
}

// Silence noisy logs in production for performance
if (!__DEV__) {
  const noop = () => {};
  // Keep warn/error visible
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.debug = noop as any;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.log = noop as any;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.time = noop as any;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.timeEnd = noop as any;
}

initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 15, // 15 minutes
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [initError] = useState<string | null>(null);

  useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          ...Ionicons.font,
        });
        setFontsLoaded(true);
      } catch (error) {
        console.log('Font loading error:', error);
        setFontsLoaded(true); // Continue anyway
      }
    }
    loadFonts();
  }, []);

  // Initialize backend on app start (wake up if sleeping)
  useEffect(() => {
    try {
      initializeBackend().catch((err: any) => {
        console.warn('Backend initialization failed:', err);
      });
    } catch (error) {
      console.warn('Error calling initializeBackend:', error);
    }
    
    // Setup notification listeners
    try {
      if (typeof setupNotificationListeners === 'function') {
        setupNotificationListeners();
      }
    } catch (error) {
      console.warn('Notification listener setup failed:', error);
    }

    // Configure Audio Mode globally
    async function configureAudio() {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          staysActiveInBackground: false,
          interruptionModeIOS: 1, // DoNotMix
          interruptionModeAndroid: 1, // DoNotMix
        });
      } catch (e) {
        console.warn('[RootLayout] Audio config failed:', e);
      }
    }
    configureAudio();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncSocket = async () => {
      try {
        const storedUserId = await AsyncStorage.getItem('userId');
        if (cancelled) return;

        if (storedUserId) {
          const existingSocket = getSocket();
          if (!existingSocket || !existingSocket.connected) {
            await initializeSocket(storedUserId);
          }
          return;
        }

        if (getSocket()) {
          disconnectSocket();
        }
      } catch (error) {
        console.warn('[RootLayout] Socket bootstrap failed:', error);
      }
    };

    const runOnce = () => { void syncSocket(); };

    let intervalId: any = null;
    const start = () => {
      if (intervalId) return;
      runOnce();
      intervalId = setInterval(syncSocket, 30000);
    };
    const stop = () => {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    // Foreground-only: avoid background churn + battery drain
    start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });

    return () => {
      cancelled = true;
      stop();
      sub.remove();
      disconnectSocket();
    };
  }, []);

  useEffect(() => {
    // Do not block UI with a JS-level loader.
  }, []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync('#ffffff').catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ErrorBoundary>
          <UserProvider>
            <AppDialogProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <StatusBar style="dark" backgroundColor="#ffffff" translucent={false} />
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#fff' } }}>
                  <Stack.Screen name="index" options={{ animation: 'none' }} />
                  <Stack.Screen name="auth/welcome" />
                  <Stack.Screen name="auth/login-options" />
                  <Stack.Screen name="auth/login-password" />
                  <Stack.Screen name="auth/phone-login" />
                  <Stack.Screen name="auth/email-login" />

                  <Stack.Screen name="auth/signup-options" />
                  <Stack.Screen name="auth/phone-signup" />
                  <Stack.Screen name="auth/email-signup" />
                  <Stack.Screen name="auth/password-signup" />
                  <Stack.Screen name="auth/phone-otp" />
                  <Stack.Screen name="auth/forgot-password" />
                  <Stack.Screen name="auth/reset-otp" />
                  <Stack.Screen name="auth/reset-password" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="create-post" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="edit-post" options={{ headerShown: false, animation: 'slide_from_right' }} />
                  <Stack.Screen name="search-modal" options={{ headerShown: false, animation: 'fade' }} />
                  <Stack.Screen name="inbox" options={{ headerShown: false }} />
                  <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
                  <Stack.Screen name="passport" options={{ headerShown: false }} />
                  <Stack.Screen name="dm" options={{ headerShown: false }} />
                  <Stack.Screen name="notifications" options={{ headerShown: false }} />
                  <Stack.Screen name="post-detail" options={{ headerShown: false, animation: 'slide_from_right' }} />
                  <Stack.Screen name="location/[placeId]" options={{ headerShown: false }} />
                  <Stack.Screen name="hashtag-detail" options={{ headerShown: false }} />
                </Stack>
              </GestureHandlerRootView>
            </AppDialogProvider>
          </UserProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
