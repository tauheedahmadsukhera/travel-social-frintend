import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type AppDialogButton = {
  text: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
};

type AppDialogPayload = {
  variant: 'success' | 'error' | 'info';
  title?: string;
  message: string;
  buttons?: AppDialogButton[];
};

type AppDialogApi = {
  show: (payload: AppDialogPayload) => void;
  showSuccess: (message: string, opts?: { title?: string; onOk?: () => void; okText?: string }) => void;
  showError: (message: string, opts?: { title?: string; onOk?: () => void; okText?: string }) => void;
  hide: () => void;
};

const AppDialogContext = createContext<AppDialogApi | null>(null);

export function useAppDialog(): AppDialogApi {
  const ctx = useContext(AppDialogContext);
  if (!ctx) throw new Error('useAppDialog must be used within AppDialogProvider');
  return ctx;
}

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [payload, setPayload] = useState<AppDialogPayload | null>(null);
  const visible = !!payload;

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  const animateIn = useCallback(() => {
    opacity.setValue(0);
    scale.setValue(0.96);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, speed: 18, bounciness: 6, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale]);

  const animateOut = useCallback((after?: () => void) => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.98, duration: 120, useNativeDriver: true }),
    ]).start(() => after?.());
  }, [opacity, scale]);

  const hide = useCallback(() => {
    if (!payload) return;
    animateOut(() => setPayload(null));
  }, [animateOut, payload]);

  const show = useCallback(
    (next: AppDialogPayload) => {
      setPayload(next);
      requestAnimationFrame(() => animateIn());
    },
    [animateIn]
  );

  const api = useMemo<AppDialogApi>(() => {
    return {
      show,
      hide,
      showSuccess: (message, opts) =>
        show({
          variant: 'success',
          title: opts?.title ?? 'Successful',
          message,
          buttons: [
            {
              text: opts?.okText ?? 'OK',
              variant: 'primary',
              onPress: opts?.onOk,
            },
          ],
        }),
      showError: (message, opts) =>
        show({
          variant: 'error',
          title: opts?.title ?? 'Error',
          message,
          buttons: [
            {
              text: opts?.okText ?? 'OK',
              variant: 'primary',
              onPress: opts?.onOk,
            },
          ],
        }),
    };
  }, [hide, show]);

  const icon = payload?.variant === 'success' ? 'checkmark-circle' : payload?.variant === 'error' ? 'close-circle' : 'information-circle';
  const iconColor = payload?.variant === 'success' ? '#22c55e' : payload?.variant === 'error' ? '#ef4444' : '#3b82f6';

  return (
    <AppDialogContext.Provider value={api}>
      {children}

      <Modal visible={visible} transparent animationType="none" onRequestClose={hide}>
        <Pressable style={styles.backdrop} onPress={hide}>
          <Animated.View
            style={[
              styles.card,
              { paddingBottom: Math.max(insets.bottom, 14) },
              { opacity, transform: [{ scale }] },
            ]}
          >
            <View style={styles.headerRow}>
              <Ionicons name={icon as any} size={30} color={iconColor} />
              <Text style={styles.titleText} numberOfLines={1}>
                {payload?.title ?? ''}
              </Text>
            </View>

            <Text style={styles.messageText}>{payload?.message ?? ''}</Text>

            <View style={styles.buttonsRow}>
              {(
                (payload?.buttons?.length ? payload.buttons : [{ text: 'OK', variant: 'primary' } as AppDialogButton]) as AppDialogButton[]
              ).map((b, idx) => {
                const isPrimary = (b.variant ?? 'primary') === 'primary';
                return (
                  <TouchableOpacity
                    key={`${b.text}_${idx}`}
                    style={[styles.button, isPrimary ? styles.primaryBtn : styles.secondaryBtn]}
                    onPress={() => {
                      animateOut(() => {
                        setPayload(null);
                        b.onPress?.();
                      });
                    }}
                  >
                    <Text style={[styles.buttonText, isPrimary ? styles.primaryText : styles.secondaryText]}>{b.text}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        </Pressable>
      </Modal>
    </AppDialogContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  titleText: { fontSize: 17, fontWeight: '800', color: '#111', flex: 1 },
  messageText: { fontSize: 14.5, color: '#333', lineHeight: 20 },
  buttonsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  button: { minWidth: 86, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  primaryBtn: { backgroundColor: '#111' },
  secondaryBtn: { backgroundColor: '#f2f2f2' },
  buttonText: { fontSize: 14, fontWeight: '700' },
  primaryText: { color: '#fff' },
  secondaryText: { color: '#111' },
});

