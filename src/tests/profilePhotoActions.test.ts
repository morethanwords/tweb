import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  peers: new Map<number, any>(),
  toastNew: vi.fn(),
  showProfilePhotoReport: vi.fn()
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getPeer: (peerId: PeerId) => mocks.peers.get(+peerId)
  }
}));

vi.mock('@lib/rootScope', () => ({
  default: {myId: (1 as UserId).toPeerId(false)}
}));

vi.mock('@components/toast', () => ({toastNew: mocks.toastNew}));
vi.mock('@components/popups/reportAd', () => ({showProfilePhotoReport: mocks.showProfilePhotoReport}));

import {getProfilePhotoActions, reportProfilePhoto, setMainProfilePhoto} from '@components/mediaViewer/profilePhotoActions';
import {SERVICE_PEER_ID} from '@appManagers/constants';

const myId = (1 as UserId).toPeerId(false);
const userId = (2 as UserId).toPeerId(false);
const groupId = (3 as ChatId).toPeerId(true);
const channelId = (4 as ChatId).toPeerId(true);

const userPhoto = (photoId: string, personal?: boolean) => ({
  _: 'userProfilePhoto' as const,
  photo_id: photoId,
  dc_id: 2,
  pFlags: personal ? {personal: true as const} : {}
});

describe('getProfilePhotoActions', () => {
  it('sets one\'s own earlier photo as the main one, never the main or the public one', () => {
    const currentPhoto = userPhoto('main');
    expect(getProfilePhotoActions({peerId: myId, myId, photoId: 'old', currentPhoto})).toEqual({canSetMain: true, canReport: false});
    expect(getProfilePhotoActions({peerId: myId, myId, photoId: 'main', currentPhoto}).canSetMain).toBe(false);
    expect(getProfilePhotoActions({peerId: myId, myId, photoId: 'public', currentPhoto, fallbackPhotoId: 'public'}).canSetMain).toBe(false);
  });

  it('reports anyone else\'s photo but Telegram\'s and the personal one given to a contact', () => {
    expect(getProfilePhotoActions({peerId: userId, myId, photoId: 'a', currentPhoto: userPhoto('a')})).toEqual({canSetMain: false, canReport: true});
    expect(getProfilePhotoActions({peerId: userId, myId, photoId: 'a', currentPhoto: userPhoto('a', true)}).canReport).toBe(false);
    // * their own photos stay reportable behind the personal one
    expect(getProfilePhotoActions({peerId: userId, myId, photoId: 'b', currentPhoto: userPhoto('a', true)}).canReport).toBe(true);
    expect(getProfilePhotoActions({peerId: SERVICE_PEER_ID, myId, photoId: 'a'}).canReport).toBe(false);
  });

  it('lets a chat\'s photo be set or reported by whether its info may be changed', () => {
    const currentPhoto = {_: 'chatPhoto' as const, photo_id: 'main', dc_id: 2, pFlags: {}};
    expect(getProfilePhotoActions({peerId: groupId, myId, photoId: 'old', currentPhoto, canChangeInfo: true})).toEqual({canSetMain: true, canReport: false});
    expect(getProfilePhotoActions({peerId: groupId, myId, photoId: 'main', currentPhoto, canChangeInfo: true})).toEqual({canSetMain: false, canReport: false});
    expect(getProfilePhotoActions({peerId: groupId, myId, photoId: 'old', currentPhoto, canChangeInfo: false})).toEqual({canSetMain: false, canReport: true});
  });
});

describe('profile photo actions', () => {
  const managers = {
    appProfileManager: {updateProfilePhoto: vi.fn()},
    appChatsManager: {setExistingPhoto: vi.fn()}
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.peers = new Map<number, any>([
      [+groupId, {_: 'channel', id: 3, pFlags: {megagroup: true}}],
      [+channelId, {_: 'channel', id: 4, pFlags: {broadcast: true}}]
    ]);
  });

  it('makes one\'s own photo the main one and says so', async() => {
    managers.appProfileManager.updateProfilePhoto.mockResolvedValue(undefined);
    await expect(setMainProfilePhoto(managers as any, myId, 'old')).resolves.toBe(true);
    expect(managers.appProfileManager.updateProfilePhoto).toHaveBeenCalledWith('old');
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'MainProfilePhotoSetHint'});
  });

  it('makes a chat\'s earlier photo its photo, in the words of a group or a channel', async() => {
    managers.appChatsManager.setExistingPhoto.mockResolvedValue(undefined);
    await setMainProfilePhoto(managers as any, groupId, 'old');
    expect(managers.appChatsManager.setExistingPhoto).toHaveBeenCalledWith(3, 'old');
    expect(mocks.toastNew).toHaveBeenLastCalledWith({langPackKey: 'MainGroupProfilePhotoSetHint'});

    await setMainProfilePhoto(managers as any, channelId, 'old');
    expect(mocks.toastNew).toHaveBeenLastCalledWith({langPackKey: 'MainChannelProfilePhotoSetHint'});
  });

  it('says it failed, and does not take it for done', async() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    managers.appProfileManager.updateProfilePhoto.mockRejectedValue({type: 'PHOTO_INVALID'});
    await expect(setMainProfilePhoto(managers as any, myId, 'old')).resolves.toBe(false);
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'Error.AnError'});
  });

  it('says nothing when the account it was asked on is left meanwhile', async() => {
    // * session-bound managers drop the answer of an account the tab switched away from
    managers.appChatsManager.setExistingPhoto.mockRejectedValue({type: 'MIDDLEWARE'});
    await expect(setMainProfilePhoto(managers as any, groupId, 'old')).resolves.toBe(false);
    expect(mocks.toastNew).not.toHaveBeenCalled();
  });

  it('names what is reported after whose photo it is', () => {
    reportProfilePhoto(userId, 'a');
    reportProfilePhoto(groupId, 'b');
    reportProfilePhoto(channelId, 'c');
    expect(mocks.showProfilePhotoReport.mock.calls).toEqual([
      [userId, 'a', 'ReportProfilePhotoTitle'],
      [groupId, 'b', 'ReportGroupPhotoTitle'],
      [channelId, 'c', 'ReportChannelPhotoTitle']
    ]);
  });
});
