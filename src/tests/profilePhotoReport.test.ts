import '@helpers/peerIdPolyfill';
import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';
import {AppProfileManager} from '@appManagers/appProfileManager';
import {AppChatsManager} from '@appManagers/appChatsManager';

const mocks = vi.hoisted(() => ({toastNew: vi.fn()}));

// * the popup graph reaches the worker proxy, which none of this needs
vi.mock('@lib/apiManagerProxy', () => ({default: new Proxy({}, {get: () => vi.fn()})}));
vi.mock('@components/toast', () => ({toastNew: mocks.toastNew}));
vi.mock('@helpers/preloadAnimatedEmojiSticker', () => ({default: vi.fn()}));

let createProfilePhotoReport: typeof import('@components/popups/reportAd').createProfilePhotoReport;
let showReportAdPopup: typeof import('@components/popups/reportAd').default;

beforeAll(async() => {
  // * the report popup's module brings the popup graph, which jsdom lacks the globals for
  stubBrowserGlobals();
  ({createProfilePhotoReport, default: showReportAdPopup} = await import('@components/popups/reportAd'));
});

const photo = {
  _: 'photo',
  id: '5',
  access_hash: '6',
  file_reference: new Uint8Array([7]),
  pFlags: {},
  date: 0,
  sizes: [] as any[],
  dc_id: 2
};

function makeManager<T extends object>(manager: T, invokeApi = vi.fn().mockResolvedValue(true)) {
  Object.assign(manager, {
    apiManager: {invokeApi},
    appPhotosManager: {getPhoto: (id: string) => id === photo.id ? photo : undefined},
    appPeersManager: {getInputPeerById: (peerId: PeerId) => ({_: 'inputPeerUser', user_id: peerId.toUserId(), access_hash: '1'})}
  });
  return invokeApi;
}

describe('reporting a profile photo', () => {
  it('sends the reason and the comment with the photo', async() => {
    const manager = new AppProfileManager();
    const invokeApi = makeManager(manager);
    const peerId = (2 as UserId).toPeerId(false);

    await manager.reportProfilePhoto(peerId, photo.id, {_: 'inputReportReasonSpam'});
    expect(invokeApi).toHaveBeenCalledWith('account.reportProfilePhoto', {
      peer: {_: 'inputPeerUser', user_id: 2, access_hash: '1'},
      photo_id: {_: 'inputPhoto', id: '5', access_hash: '6', file_reference: new Uint8Array([7])},
      reason: {_: 'inputReportReasonSpam'},
      message: ''
    });
  });

  it('puts the reasons as options, asks what is wrong for Other only and reports by the reason', async() => {
    const reportProfilePhoto = vi.fn().mockResolvedValue(true);
    const peerId = (2 as UserId).toPeerId(false);
    const report = createProfilePhotoReport({appProfileManager: {reportProfilePhoto}} as any, peerId, photo.id, 'ReportProfilePhotoTitle');

    const choose = await report(new Uint8Array());
    expect(choose._).toBe('reportResultChooseOption');
    const options = (choose as any).options as {text: string, option: Uint8Array}[];
    // * no language pack here: the keys stand for their strings
    expect(options.map(({text}) => text)).toEqual([
      'ReportChatSpam', 'ReportChatViolence', 'ReportChatChild', 'ReportChatPornography', 'ReportChatCopyright', 'ReportChatOther'
    ]);
    expect(reportProfilePhoto).not.toHaveBeenCalled();

    await expect(report(options[0].option)).resolves.toEqual({_: 'reportResultReported'});
    expect(reportProfilePhoto).toHaveBeenLastCalledWith(peerId, photo.id, {_: 'inputReportReasonSpam'}, undefined);

    const other = options[5].option;
    await expect(report(other)).resolves.toEqual({_: 'reportResultAddComment', pFlags: {}, option: other});
    expect(reportProfilePhoto).toHaveBeenCalledTimes(1);

    await expect(report(other, 'stolen')).resolves.toEqual({_: 'reportResultReported'});
    expect(reportProfilePhoto).toHaveBeenLastCalledWith(peerId, photo.id, {_: 'inputReportReasonOther'}, 'stolen');
  });

  it('says nothing of a report whose account was left meanwhile, and that any other failed', async() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.toastNew.mockClear();
    // * session-bound managers drop the answer of an account the tab switched away from
    const left = vi.fn().mockRejectedValue({type: 'MIDDLEWARE'});
    showReportAdPopup('photo', left);
    await vi.waitFor(() => expect(left).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve));
    expect(mocks.toastNew).not.toHaveBeenCalled();

    const failed = vi.fn().mockRejectedValue({type: 'PHOTO_INVALID'});
    showReportAdPopup('photo', failed);
    await vi.waitFor(() => expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'Error.AnError'}));
  });
});

describe('setting a chat\'s earlier photo as its photo', () => {
  function makeChatsManager(chat: object) {
    const manager = new AppChatsManager();
    const invokeApi = makeManager(manager, vi.fn().mockResolvedValue({_: 'updates', updates: [], users: [], chats: []}));
    Object.assign(manager, {
      chats: {[(chat as any).id]: chat},
      apiUpdatesManager: {processUpdateMessage: vi.fn()},
      rootScope: {dispatchEvent: vi.fn()}
    });
    return {manager, invokeApi};
  }

  it('edits a channel\'s photo to the photo itself', async() => {
    const {manager, invokeApi} = makeChatsManager({_: 'channel', id: 3, access_hash: '4', pFlags: {megagroup: true}});
    await manager.setExistingPhoto(3, photo.id);
    expect(invokeApi).toHaveBeenCalledWith('channels.editPhoto', {
      channel: {_: 'inputChannel', channel_id: 3, access_hash: '4'},
      photo: {_: 'inputChatPhoto', id: {_: 'inputPhoto', id: '5', access_hash: '6', file_reference: new Uint8Array([7])}}
    });
  });

  it('edits a basic group\'s photo to the photo itself', async() => {
    const {manager, invokeApi} = makeChatsManager({_: 'chat', id: 8, pFlags: {}});
    await manager.setExistingPhoto(8, photo.id);
    expect(invokeApi).toHaveBeenCalledWith('messages.editChatPhoto', {
      chat_id: 8,
      photo: {_: 'inputChatPhoto', id: {_: 'inputPhoto', id: '5', access_hash: '6', file_reference: new Uint8Array([7])}}
    });
  });
});
