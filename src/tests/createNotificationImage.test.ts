const mocks = vi.hoisted(() => ({
  readBlobAsDataURL: vi.fn()
}));

vi.mock('@helpers/blob/readBlobAsDataURL', () => ({
  default: mocks.readBlobAsDataURL
}));

import createNotificationImage from '@helpers/createNotificationImage';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createNotificationImage', () => {
  it('uses independent avatar bytes instead of a shared object URL', async() => {
    const photo = {_: 'userProfilePhoto'};
    const blob = new Blob(['avatar'], {type: 'image/jpeg'});
    const downloadAvatar = vi.fn().mockResolvedValue(blob);
    const managers = {
      appAvatarsManager: {
        downloadAvatar
      },
      appPeersManager: {
        getPeerPhoto: vi.fn().mockResolvedValue(photo)
      }
    } as any;
    mocks.readBlobAsDataURL.mockResolvedValue('data:image/jpeg;base64,YXZhdGFy');

    await expect(createNotificationImage(managers, 123 as PeerId, 'Peer'))
    .resolves.toBe('data:image/jpeg;base64,YXZhdGFy');

    expect(downloadAvatar).toHaveBeenCalledWith(
      123,
      photo,
      'photo_small'
    );
    expect(mocks.readBlobAsDataURL).toHaveBeenCalledWith(blob);
  });
});
