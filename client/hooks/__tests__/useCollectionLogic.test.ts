import { renderHook, act } from '@testing-library/react-native';
import { useCollectionLogic } from '../useCollectionLogic';
import { apiService } from '../../src/services/apiService';
import { feedEventEmitter } from '../../lib/feedEventEmitter';

jest.mock('../../src/services/apiService');
jest.mock('../../lib/feedEventEmitter');

describe('useCollectionLogic', () => {
  const mockPostId = 'post123';
  const mockUserId = 'user123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load collections', async () => {
    (apiService.get as jest.Mock).mockResolvedValue({
      success: true,
      data: [{ _id: 'col1', name: 'Travel', postIds: [] }],
    });

    const { result } = renderHook(() => useCollectionLogic(mockPostId, mockUserId));

    await act(async () => {
      await result.current.loadCollections();
    });

    expect(result.current.collections).toHaveLength(1);
    expect(result.current.collections[0].name).toBe('Travel');
  });

  it('should toggle post in collection', async () => {
    const mockCollections = [{ _id: 'col1', name: 'Travel', postIds: [] }];
    (apiService.get as jest.Mock).mockResolvedValue({ success: true, data: mockCollections });
    (apiService.put as jest.Mock).mockResolvedValue({ success: true });

    const { result } = renderHook(() => useCollectionLogic(mockPostId, mockUserId));

    await act(async () => {
      await result.current.loadCollections();
    });

    const mockShowToast = jest.fn();

    await act(async () => {
      await result.current.togglePostInCollection('col1', mockShowToast);
    });

    expect(apiService.put).toHaveBeenCalledWith(
      expect.stringContaining('col1'),
      expect.objectContaining({ addPostId: mockPostId })
    );
    expect(mockShowToast).toHaveBeenCalledWith('Saved to Travel');
    expect(feedEventEmitter.emitPostUpdated).toHaveBeenCalled();
  });

  it('should create a new collection', async () => {
    const mockCreated = { _id: 'new_col', name: 'Beaches', postIds: [mockPostId] };
    (apiService.post as jest.Mock).mockResolvedValue({ success: true, data: mockCreated });

    const { result } = renderHook(() => useCollectionLogic(mockPostId, mockUserId));

    let created;
    await act(async () => {
      created = await result.current.createCollection({ name: 'Beaches' });
    });

    expect(created).toEqual(mockCreated);
    expect(result.current.collections).toContainEqual(mockCreated);
  });
});
