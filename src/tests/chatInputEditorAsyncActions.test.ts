import '@/tests/mocks/chatInputIntegrationUi';
import ChatInput from '@components/chat/input';
import createChatInputEditor from '@components/chat/inputEditor';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';
import {openCreateLinkPopupForEditor} from '@components/popups/createLinkForInput';
import EditorToolbar from '@components/richMessageInput/toolbar';
import deferredPromise from '@helpers/cancellablePromise';
import type {CreateLinkPopupResult} from '@components/popups/createLink';

const mocks = vi.hoisted(() => ({link: vi.fn()}));
vi.mock('@components/popups/createLink', () => ({default: mocks.link}));
vi.mock('@lib/appImManager', () => ({AppImManager: class {}, APP_TABS: {}, default: {}}));

let mounted: ReturnType<typeof mountChatInputEditor>;
beforeEach(() => {mounted = mountChatInputEditor(); mocks.link.mockReset();});
afterEach(() => {mounted.editor.destroy(); mounted.input.remove();});

test('opens the link form from the selection without accessing clipboard or permissions', async() => {
  const {editor} = mounted;
  editor.setTextWithEntities('Selected text');
  editor.restoreSelection({from: 1, to: 14}, false);
  const access = vi.fn(() => {throw new Error('Unexpected clipboard or permission access');});
  const properties = ['clipboard', 'permissions'] as const;
  const descriptors = properties.map((name) => Object.getOwnPropertyDescriptor(navigator, name));
  properties.forEach((name) => Object.defineProperty(navigator, name, {configurable: true, get: access}));
  mocks.link.mockResolvedValue(undefined);
  const toolbar = new EditorToolbar({getEditor: () => editor, captureContext: () => () => true});
  try {
    await toolbar.insertLink();
    expect(mocks.link).toHaveBeenCalledWith({editing: false, text: 'Selected text', url: ''});
    expect(access).not.toHaveBeenCalled();
  } finally {
    toolbar.destroy();
    properties.forEach((name, index) => {
      if(descriptors[index]) Object.defineProperty(navigator, name, descriptors[index]);
      else delete navigator[name];
    });
  }
});

test.each(['none', 'document', 'destroy', 'detach', 'remount'] as const)(
  'applies the link form only to the original document (%s)', async(interruption) => {
    const {editor, input} = mounted;
    editor.setTextWithEntities('Old draft');
    editor.restoreSelection({from: 1, to: 10}, false);
    const result = deferredPromise<CreateLinkPopupResult>();
    mocks.link.mockReturnValue(result);
    const pending = openCreateLinkPopupForEditor(editor);
    await vi.waitFor(() => expect(mocks.link).toHaveBeenCalled());
    if(interruption === 'document') editor.setTextWithEntities('New draft');
    if(interruption === 'destroy' || interruption === 'remount') editor.destroy();
    if(interruption === 'detach') input.remove();
    if(interruption === 'remount') {
      mounted.editor = createChatInputEditor(input);
      mounted.editor.setTextWithEntities('New draft');
    }
    result.resolve({text: 'Old link', url: 'https://example.com'});
    expect(await pending).toBe(interruption === 'none');
    if(interruption === 'none') expect(editor.getRichValue().value).toBe('Old link');
    if(interruption === 'document' || interruption === 'remount') expect(mounted.editor.getRichValue().value).toBe('New draft');
  }
);

function previewHost() {
  const getWebPage = vi.fn(async() => ({_: 'webPage', pFlags: {}, id: '1', url: 'https://example.com'}));
  const host = {
    messageInputEditor: mounted.editor,
    editMessage: undefined as undefined,
    noWebPage: false,
    lastUrl: '',
    getWebPagePromise: undefined as Promise<unknown>,
    willSendWebPage: null as unknown,
    managers: {appWebPagesManager: {getWebPage}},
    chat: {canSend: async() => true},
    setTopInfo: vi.fn(() => document.createElement('div')),
    setCurrentHover: vi.fn(),
    clearHelper: vi.fn()
  };
  const process = () => (ChatInput.prototype as any).processWebPage.call(host, 'https://example.com', [
    {_: 'messageEntityUrl', offset: 0, length: 19}
  ]);
  return {host, getWebPage, process};
}

test('plain URLs retain previews, rich content suppresses them, and returning to plain restores them', async() => {
  const {editor} = mounted;
  const {host, getWebPage, process} = previewHost();
  editor.setTextWithEntities('https://example.com');
  expect(editor.getMode()).toBe('plain');
  process();
  await host.getWebPagePromise;
  expect(getWebPage).toHaveBeenCalledTimes(1);
  expect(host.willSendWebPage).toBeTruthy();
  expect(host.noWebPage).toBeUndefined();
  editor.setExpanded(true);
  editor.toggleHeading(1);
  expect(editor.getMode()).toBe('rich');
  process();
  expect(host.willSendWebPage).toBeNull();
  expect(host.noWebPage).toBe(true);
  expect(getWebPage).toHaveBeenCalledTimes(1);
  editor.setExpanded(false);
  editor.setTextWithEntities('https://example.com');
  process();
  await host.getWebPagePromise;
  expect(getWebPage).toHaveBeenCalledTimes(2);
  expect(host.noWebPage).toBeUndefined();
});

test('a cancelled preview cannot win against a fresh request for the same URL', async() => {
  const {editor} = mounted;
  const {host, getWebPage, process} = previewHost();
  const old = deferredPromise<any>();
  const fresh = deferredPromise<any>();
  getWebPage.mockReturnValueOnce(old).mockReturnValueOnce(fresh);
  editor.setTextWithEntities('https://example.com');
  process();
  const oldRequest = host.getWebPagePromise;
  editor.setExpanded(true);
  editor.toggleHeading(1);
  process();
  editor.setExpanded(false);
  editor.setTextWithEntities('https://example.com');
  process();
  const freshRequest = host.getWebPagePromise;
  old.resolve({_: 'webPage', pFlags: {}, title: 'Old'});
  await oldRequest;
  expect(host.setTopInfo).not.toHaveBeenCalled();
  fresh.resolve({_: 'webPage', pFlags: {}, title: 'Fresh'});
  await freshRequest;
  expect(host.setTopInfo).toHaveBeenCalledWith(expect.objectContaining({title: 'Fresh'}));
});
