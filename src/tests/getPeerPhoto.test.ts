import {Chat, User} from '@layer';
import getPeerPhoto from '@appManagers/utils/peers/getPeerPhoto';

describe('getPeerPhoto', () => {
  test.each([
    {
      name: 'community',
      peer: {
        _: 'community',
        pFlags: {},
        photo: {_: 'chatPhotoEmpty'}
      } as Chat.community
    },
    {
      name: 'user',
      peer: {
        _: 'user',
        pFlags: {},
        photo: {_: 'userProfilePhotoEmpty'}
      } as User.user
    }
  ])('does not expose an empty $name photo as downloadable media', ({peer}) => {
    expect(getPeerPhoto(peer)).toBeUndefined();
  });

  test('keeps a downloadable community photo', () => {
    const photo = {
      _: 'chatPhoto',
      pFlags: {},
      photo_id: '1',
      dc_id: 2
    } as const;
    const community = {
      _: 'community',
      pFlags: {},
      photo
    } as Chat.community;

    expect(getPeerPhoto(community)).toBe(photo);
  });
});
