import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  children: React.ReactNode;
  /** Optional fallback UI. If not provided, a generic error card is shown. */
  fallback?: React.ReactNode;
  /** Label for the retry button */
  retryLabel?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * AppErrorBoundary — catches render errors in any child component tree.
 * Prevents the entire screen from crashing when a single widget fails.
 *
 * Usage:
 *   <AppErrorBoundary>
 *     <PostCard ... />
 *   </AppErrorBoundary>
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In dev, log full stack. In production, silence noisy logs.
    if (__DEV__) {
      console.error('[ErrorBoundary] Caught error:', error);
      console.error('[ErrorBoundary] Component stack:', info.componentStack);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          {__DEV__ && (
            <Text style={styles.detail} numberOfLines={3}>
              {this.state.errorMessage}
            </Text>
          )}
          <TouchableOpacity style={styles.retryBtn} onPress={this.handleRetry}>
            <Text style={styles.retryText}>{this.props.retryLabel || 'Try again'}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    margin: 8,
    minHeight: 120,
  },
  emoji: { fontSize: 32, marginBottom: 8 },
  title: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 6 },
  detail: { fontSize: 12, color: '#888', textAlign: 'center', marginBottom: 12 },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#FF8D00',
    borderRadius: 20,
  },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

export default AppErrorBoundary;
