import React from 'react';
import { render } from '@testing-library/react-native';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { useOfflineBanner } from '../hooks/useOffline';

// Mock the hook
jest.mock('../hooks/useOffline', () => ({
  useOfflineBanner: jest.fn(),
}));

describe('OfflineBanner', () => {
  it('renders correctly when offline', () => {
    (useOfflineBanner as jest.Mock).mockReturnValue({
      showBanner: true,
      isOnline: false,
    });

    const { getByText, toJSON } = render(<OfflineBanner />);
    expect(getByText(/No internet connection/i)).toBeTruthy();
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders correctly when back online', () => {
    (useOfflineBanner as jest.Mock).mockReturnValue({
      showBanner: true,
      isOnline: true,
    });

    const { getByText, toJSON } = render(<OfflineBanner />);
    expect(getByText(/Back online/i)).toBeTruthy();
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders nothing when showBanner is false', () => {
    (useOfflineBanner as jest.Mock).mockReturnValue({
      showBanner: false,
      isOnline: true,
    });

    const { queryByText } = render(<OfflineBanner />);
    expect(queryByText(/internet/i)).toBeNull();
  });
});
