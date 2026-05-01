import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
} & Omit<ScrollViewProps, 'contentContainerStyle' | 'children'>;

/**
 * Auth forms: avoids SafeArea bottom + KeyboardAvoidingView "padding" fighting on iOS
 * (caret flicker / keyboard-top flash). iOS uses ScrollView keyboard insets; Android
 * uses a light KeyboardAvoidingView.
 */
export function AuthKeyboardScroll({ children, contentContainerStyle, style, ...scrollRest }: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 12);
  const mergedContent: StyleProp<ViewStyle> = [
    styles.flexGrow,
    { paddingBottom: bottomPad },
    contentContainerStyle,
  ];

  if (Platform.OS === 'ios') {
    return (
      <ScrollView
        style={[{ flex: 1 }, style]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={mergedContent}
        {...scrollRest}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={0}>
      <ScrollView
        style={[{ flex: 1 }, style]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={mergedContent}
        {...scrollRest}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1 },
});
