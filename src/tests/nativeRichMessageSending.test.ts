import {describe, expect, test, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import deferredPromise from '@helpers/cancellablePromise';
import {AppMessagesManager, RichMessagePayload} from '@appManagers/appMessagesManager';
import {AppDraftsManager} from '@appManagers/appDraftsManager';
import {tiptapToRichMessage} from '@components/chat/inputEditor/richMessage';
import {createChatInputEditorTestData} from '@components/chat/inputEditor/testData';
import {DraftMessage, InputPeer, InputRichMessage, Message, PageBlock, PageCaption, RichMessage, Updates, WebPage} from '@layer';

const peerId = (42 as UserId).toPeerId(false);
const inputPeer: InputPeer.inputPeerUser = {
  _: 'inputPeerUser',
  user_id: 42,
  access_hash: '1'
};
const emptyText = {_: 'textEmpty'} as const;
const emptyCaption: PageCaption = {_: 'pageCaption', text: emptyText, credit: emptyText};

function makeRichMessage(): RichMessagePayload {
  const blocks: PageBlock[] = [{
    _: 'pageBlockParagraph',
    text: {
      _: 'textBold',
      text: {_: 'textPlain', text: '**rich**'}
    }
  }];
  const input: InputRichMessage.inputRichMessage = {
    _: 'inputRichMessage',
    pFlags: {},
    blocks
  };
  const output: RichMessage.richMessage = {
    _: 'richMessage',
    pFlags: {},
    blocks,
    photos: [],
    documents: []
  };

  return {input, output};
}

function makeUpdates(): Updates.updates {
  return {
    _: 'updates',
    updates: [],
    users: [],
    chats: [],
    date: 0,
    seq: 0
  };
}

function makeReferencedRichMessage(): RichMessagePayload {
  const blocks: PageBlock[] = [
    {
      _: 'pageBlockParagraph',
      text: {
        _: 'textConcat',
        texts: [
          {_: 'textCustomEmoji', document_id: 100, alt: '✨'},
          {
            _: 'textMentionName',
            user_id: 300,
            text: {_: 'textPlain', text: 'Alice'}
          }
        ]
      }
    },
    {
      _: 'pageBlockPhoto',
      pFlags: {},
      photo_id: 200,
      caption: emptyCaption
    }
  ];

  return {
    input: {
      _: 'inputRichMessage',
      pFlags: {},
      blocks
    },
    output: {
      _: 'richMessage',
      pFlags: {},
      blocks,
      photos: [],
      documents: []
    }
  };
}

function makeMessagesManager() {
  const manager = new AppMessagesManager();
  const invokeApi = vi.fn().mockResolvedValue(makeUpdates());
  const invokeApiAfter = vi.fn().mockResolvedValue(makeUpdates());
  const optimisticMessages: Message.message[] = [];

  Object.assign(manager as any, {
    apiManager: {
      getAppConfig: vi.fn().mockResolvedValue({}),
      invokeApi,
      invokeApiAfter
    },
    apiUpdatesManager: {
      processLocalUpdate: vi.fn(),
      processPaidMessageUpdate: vi.fn(),
      processUpdateMessage: vi.fn()
    },
    appPeersManager: {
      getInputPeerById: () => inputPeer,
      getPeerMigratedTo: (): PeerId | undefined => undefined,
      isChannel: () => false,
      isAnyGroup: () => false
    },
    appUsersManager: {isBot: () => false},
    repayRequestHandler: {tryRegisterRequest: vi.fn()},
    appProfileManager: {isEphemeralBotCommand: vi.fn().mockReturnValue(false)},
    rootScope: {dispatchEvent: vi.fn(), premium: true}
  });

  vi.spyOn(manager, 'checkSendOptions').mockResolvedValue({
    config: {message_length_max: 4},
    appConfig: {emojies_send_dice: ['🎲']}
  } as any);
  vi.spyOn(manager, 'generateOutgoingMessage').mockImplementation(() => ({
    _: 'message',
    id: -1,
    mid: -1,
    peerId,
    pFlags: {},
    message: '',
    random_id: '1',
    promise: deferredPromise<void>()
  } as any));
  vi.spyOn(manager, 'beforeMessageSending').mockImplementation((message) => {
    optimisticMessages.push(message);
    void message.send();
    return undefined;
  });
  vi.spyOn(manager as any, 'onMessagesSendError').mockImplementation(() => {});

  return {invokeApi, invokeApiAfter, manager, optimisticMessages};
}

describe('native rich-message manager plumbing', () => {
  test('does not let a stale full-page request overwrite a newer rich edit', async() => {
    const {invokeApi, manager} = makeMessagesManager();
    const staleRequest = deferredPromise<any>();
    const freshRichMessage = makeRichMessage().output;
    freshRichMessage.blocks = [{
      _: 'pageBlockParagraph',
      text: {_: 'textPlain', text: 'fresh edit'}
    }];
    invokeApi.mockReturnValueOnce(staleRequest);
    const saveApiResult = vi.spyOn(manager, 'saveApiResult').mockImplementation(() => {});
    vi.spyOn(manager, 'getMessageByPeer').mockReturnValue({
      _: 'message',
      rich_message: freshRichMessage
    } as Message.message);

    const result = manager.getRichMessage(peerId, 7);
    (manager as any).invalidateRichMessage(peerId, 7);
    staleRequest.resolve({
      _: 'messages.messages',
      messages: [{
        _: 'message',
        id: 7,
        rich_message: makeRichMessage().output
      }],
      chats: [],
      users: []
    });

    await expect(result).rejects.toMatchObject({type: 'MESSAGE_ID_INVALID'});
    expect(saveApiResult).not.toHaveBeenCalled();
  });

  test('resolves cached document, photo, and user references and enriches the optimistic output', async() => {
    const {invokeApiAfter, manager, optimisticMessages} = makeMessagesManager();
    const richMessage = makeReferencedRichMessage();
    richMessage.output.pFlags = {rtl: true};
    richMessage.output.blocks = [{
      _: 'pageBlockParagraph',
      text: {_: 'textPlain', text: 'stale caller output'}
    }];
    const fileReference = new Uint8Array([1, 2, 3]);
    const document = {
      _: 'document',
      id: 100,
      access_hash: '101',
      file_reference: fileReference
    } as any;
    const photo = {
      _: 'photo',
      id: 200,
      access_hash: '201',
      file_reference: fileReference
    } as any;

    Object.assign(manager as any, {
      appDocsManager: {getDoc: (id: number): any => id === 100 ? document : undefined},
      appPhotosManager: {getPhoto: (id: number): any => id === 200 ? photo : undefined},
      appUsersManager: {
        isBot: () => false,
        getUser: (id: number): any => id === 300 ? {id} : undefined,
        getUserInput: (id: number) => ({_: 'inputUser', user_id: id, access_hash: '301'})
      }
    });

    await manager.sendText({peerId, text: '', richMessage});

    const params = invokeApiAfter.mock.calls[0][1];
    expect(params.rich_message.documents).toEqual([{
      _: 'inputDocument',
      id: 100,
      access_hash: '101',
      file_reference: fileReference
    }]);
    expect(params.rich_message.photos).toEqual([{
      _: 'inputPhoto',
      id: 200,
      access_hash: '201',
      file_reference: fileReference
    }]);
    expect(params.rich_message.users).toEqual([{
      _: 'inputUser',
      user_id: 300,
      access_hash: '301'
    }]);
    expect(optimisticMessages[0].rich_message).toEqual({
      ...richMessage.output,
      pFlags: {},
      blocks: richMessage.input.blocks,
      documents: [document],
      photos: [photo]
    });
  });

  test('refreshes rich document and photo references once before retrying send', async() => {
    const {invokeApiAfter, manager} = makeMessagesManager();
    const richMessage = makeReferencedRichMessage();
    const documentReference = new Uint8Array([1]);
    const photoReference = new Uint8Array([2]);
    const document = {
      _: 'document',
      id: 100,
      access_hash: '101',
      file_reference: documentReference
    } as any;
    const photo = {
      _: 'photo',
      id: 200,
      access_hash: '201',
      file_reference: photoReference
    } as any;
    const referencesStorage = {
      refreshReference: vi.fn((reference: Uint8Array) => {
        return Promise.resolve(new Uint8Array([reference[0] + 10]));
      })
    };
    const sentReferences: number[][] = [];

    Object.assign(manager as any, {
      appDocsManager: {getDoc: () => document},
      appPhotosManager: {getPhoto: () => photo},
      appUsersManager: {
        isBot: () => false,
        getUser: (id: number): any => ({id}),
        getUserInput: (id: number) => ({_: 'inputUser', user_id: id, access_hash: '301'})
      },
      referencesStorage
    });
    invokeApiAfter.mockImplementation((_method, params) => {
      sentReferences.push([
        params.rich_message.documents[0].file_reference[0],
        params.rich_message.photos[0].file_reference[0]
      ]);
      return sentReferences.length === 1 ?
        Promise.reject({type: 'FILE_REFERENCE_0_EXPIRED'}) :
        Promise.resolve(makeUpdates());
    });

    await manager.sendText({peerId, richMessage});

    expect(invokeApiAfter).toHaveBeenCalledTimes(2);
    expect(referencesStorage.refreshReference).toHaveBeenCalledTimes(2);
    expect(sentReferences).toEqual([[1, 2], [11, 12]]);
  });

  test('rejects unresolved mandatory media references before sending', async() => {
    const {invokeApiAfter, manager} = makeMessagesManager();
    const richMessage = makeReferencedRichMessage();
    Object.assign(manager as any, {
      appDocsManager: {getDoc: (): undefined => undefined},
      appPhotosManager: {getPhoto: (): undefined => undefined},
      appUsersManager: {getUser: (): undefined => undefined}
    });

    await expect(manager.sendText({peerId, text: '', richMessage})).rejects.toMatchObject({
      type: 'UNKNOWN',
      message: 'RICH_MESSAGE_REFERENCES_MISSING document:100, photo:200'
    });
    expect(invokeApiAfter).not.toHaveBeenCalled();
  });

  test('degrades an unresolved mention-name link to its visible plain text', () => {
    const {manager} = makeMessagesManager();
    const richMessage = makeRichMessage();
    richMessage.input.blocks = [{
      _: 'pageBlockParagraph',
      text: {
        _: 'textMentionName',
        user_id: 300,
        text: {
          _: 'textBold',
          text: {_: 'textPlain', text: 'Alice'}
        }
      }
    }];
    Object.assign(manager as any, {
      appDocsManager: {getDoc: (): undefined => undefined},
      appPhotosManager: {getPhoto: (): undefined => undefined},
      appUsersManager: {getUser: (): undefined => undefined}
    });

    const resolved = manager.resolveInputRichMessage(richMessage.input);

    expect(resolved.users).toBeUndefined();
    expect(resolved.blocks).toEqual([{
      _: 'pageBlockParagraph',
      text: {
        _: 'textBold',
        text: {_: 'textPlain', text: 'Alice'}
      }
    }]);
  });

  test('sends one native rich message without plain entities, splitting, Markdown, or webpage media', async() => {
    const {invokeApiAfter, manager, optimisticMessages} = makeMessagesManager();
    const richMessage = makeRichMessage();
    const text = '**legacy markdown that is much longer than the configured limit**';

    await manager.sendText({
      peerId,
      text,
      entities: [{_: 'messageEntityItalic', offset: 0, length: 2}],
      richMessage,
      webPage: {
        _: 'webPage',
        pFlags: {},
        id: '10',
        url: 'https://example.com',
        display_url: 'example.com',
        hash: 0
      } as WebPage.webPage,
      webPageOptions: {largeMedia: true},
      invertMedia: true
    });

    expect(invokeApiAfter).toHaveBeenCalledTimes(1);
    const [method, params] = invokeApiAfter.mock.calls[0];
    expect(method).toBe('messages.sendMessage');
    expect(params.message).toBe('');
    expect(params.entities).toBeUndefined();
    expect(params.rich_message).toEqual(richMessage.input);
    expect(params.no_webpage).toBe(true);
    expect(params.media).toBeUndefined();

    expect(optimisticMessages).toHaveLength(1);
    expect(optimisticMessages[0].message).toBe('');
    expect(optimisticMessages[0].entities).toBeUndefined();
    expect(optimisticMessages[0].rich_message).toEqual(richMessage.output);
  });

  test('enforces rich_message_posting without affecting enabled rollout users', async() => {
    const disallowed = makeMessagesManager();
    (disallowed.manager as any).rootScope.premium = false;
    vi.mocked(disallowed.manager.checkSendOptions).mockResolvedValue({
      config: {message_length_max: 4096},
      appConfig: {rich_message_posting: 'premium'}
    } as any);

    await expect(disallowed.manager.sendText({
      peerId,
      richMessage: makeRichMessage()
    })).rejects.toMatchObject({
      type: 'PREMIUM_ACCOUNT_REQUIRED',
      message: 'RICH_MESSAGE_PREMIUM_REQUIRED'
    });
    expect(disallowed.invokeApiAfter).not.toHaveBeenCalled();

    const enabled = makeMessagesManager();
    (enabled.manager as any).rootScope.premium = false;
    vi.mocked(enabled.manager.checkSendOptions).mockResolvedValue({
      config: {message_length_max: 4096},
      appConfig: {rich_message_posting: 'enabled'}
    } as any);

    await enabled.manager.sendText({peerId, richMessage: makeRichMessage()});
    expect(enabled.invokeApiAfter).toHaveBeenCalledOnce();
  });

  test('keeps editor structural blocks intact on the wire', async() => {
    const {invokeApiAfter, manager} = makeMessagesManager();
    const richMessage = tiptapToRichMessage({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: {language: 'typescript'},
          content: [{type: 'text', text: 'const answer = 42;'}]
        },
        {
          type: 'chatTableWrapper',
          content: [
            {
              type: 'chatTableTitle',
              content: [{
                type: 'text',
                text: 'Metrics',
                marks: [{type: 'bold'}]
              }]
            },
            {
              type: 'table',
              content: [{
                type: 'tableRow',
                content: [{
                  type: 'tableCell',
                  content: [{type: 'paragraph', content: [{type: 'text', text: 'cell'}]}]
                }]
              }]
            }
          ]
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: {checked: true},
              content: [{type: 'paragraph', content: [{type: 'text', text: 'done'}]}]
            },
            {
              type: 'taskItem',
              attrs: {checked: false},
              content: [{type: 'paragraph', content: [{type: 'text', text: 'todo'}]}]
            }
          ]
        },
        {
          type: 'heading',
          attrs: {level: 1},
          content: [{type: 'text', text: 'Largest heading'}]
        },
        {
          type: 'heading',
          attrs: {level: 6},
          content: [{type: 'text', text: 'Smallest heading'}]
        },
        {
          type: 'pullquote',
          content: [
            {
              type: 'pullquoteText',
              content: [{type: 'text', text: 'A thought', marks: [{type: 'bold'}]}]
            },
            {
              type: 'pullquoteCaption',
              content: [{type: 'text', text: 'Author', marks: [{type: 'italic'}]}]
            }
          ]
        },
        {
          type: 'details',
          attrs: {open: true},
          content: [
            {
              type: 'detailsSummary',
              content: [{type: 'text', text: 'More', marks: [{type: 'bold'}]}]
            },
            {
              type: 'detailsBody',
              content: [{type: 'paragraph', content: [{type: 'text', text: 'Hidden body'}]}]
            }
          ]
        }
      ]
    });

    await manager.sendText({peerId, richMessage});

    const params = invokeApiAfter.mock.calls[0][1];
    expect(params.message).toBe('');
    expect(params.entities).toBeUndefined();
    expect(params.rich_message.blocks).toEqual([
      {
        _: 'pageBlockPreformatted',
        text: {_: 'textPlain', text: 'const answer = 42;'},
        language: 'typescript'
      },
      {
        _: 'pageBlockTable',
        pFlags: {},
        title: {
          _: 'textBold',
          text: {_: 'textPlain', text: 'Metrics'}
        },
        rows: [{
          _: 'pageTableRow',
          cells: [{
            _: 'pageTableCell',
            pFlags: {},
            text: {_: 'textPlain', text: 'cell'},
            colspan: undefined,
            rowspan: undefined
          }]
        }]
      },
      {
        _: 'pageBlockList',
        items: [
          {
            _: 'pageListItemText',
            pFlags: {checkbox: true, checked: true},
            text: {_: 'textPlain', text: 'done'}
          },
          {
            _: 'pageListItemText',
            pFlags: {checkbox: true, checked: undefined},
            text: {_: 'textPlain', text: 'todo'}
          }
        ]
      },
      {
        _: 'pageBlockHeading1',
        text: {_: 'textPlain', text: 'Largest heading'}
      },
      {
        _: 'pageBlockHeading6',
        text: {_: 'textPlain', text: 'Smallest heading'}
      },
      {
        _: 'pageBlockPullquote',
        text: {
          _: 'textBold',
          text: {_: 'textPlain', text: 'A thought'}
        },
        caption: {
          _: 'textItalic',
          text: {_: 'textPlain', text: 'Author'}
        }
      },
      {
        _: 'pageBlockDetails',
        pFlags: {open: true},
        blocks: [{_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'Hidden body'}}],
        title: {
          _: 'textBold',
          text: {_: 'textPlain', text: 'More'}
        }
      }
    ]);
  });

  test('edits with native rich payload and ignores legacy entities and webpage media', async() => {
    const {invokeApi, manager} = makeMessagesManager();
    const richMessage = makeRichMessage();
    const message = {
      _: 'message',
      id: 100,
      mid: 100,
      peerId,
      pFlags: {},
      message: 'old'
    } as Message.message;

    await manager.editMessage(message, '**legacy markdown**', {
      entities: [{_: 'messageEntityItalic', offset: 0, length: 2}],
      richMessage,
      webPage: {
        _: 'webPage',
        pFlags: {},
        id: '10',
        url: 'https://example.com',
        display_url: 'example.com',
        hash: 0
      } as WebPage.webPage,
      webPageOptions: {smallMedia: true},
      invertMedia: true
    });

    expect(invokeApi).toHaveBeenCalledTimes(1);
    const [method, params] = invokeApi.mock.calls[0];
    expect(method).toBe('messages.editMessage');
    expect(params.message).toBeUndefined();
    expect(params.entities).toBeUndefined();
    expect(params.rich_message).toEqual(richMessage.input);
    expect(params.no_webpage).toBe(true);
    expect(params.media).toBeUndefined();
  });

  test('refreshes a rich reference once before retrying edit and invalidates the cached rich part', async() => {
    const {invokeApi, manager} = makeMessagesManager();
    const richMessage = makeReferencedRichMessage();
    const documentReference = new Uint8Array([3]);
    const document = {
      _: 'document',
      id: 100,
      access_hash: '101',
      file_reference: documentReference
    } as any;
    const referencesStorage = {
      refreshReference: vi.fn().mockResolvedValue(new Uint8Array([13]))
    };
    const message = {
      _: 'message',
      id: 100,
      mid: 100,
      peerId,
      pFlags: {},
      message: 'old'
    } as Message.message;
    richMessage.input.blocks = [richMessage.input.blocks[0]];
    richMessage.output.blocks = [richMessage.output.blocks[0]];
    const sentReferences: number[] = [];

    Object.assign(manager as any, {
      appDocsManager: {getDoc: () => document},
      appPhotosManager: {getPhoto: (): undefined => undefined},
      appUsersManager: {
        getUser: (id: number): any => ({id}),
        getUserInput: (id: number) => ({_: 'inputUser', user_id: id, access_hash: '301'})
      },
      referencesStorage
    });
    (manager as any).richMessages.set(`${peerId}_100`, Promise.resolve(richMessage.output));
    invokeApi.mockImplementation((_method, params) => {
      sentReferences.push(params.rich_message.documents[0].file_reference[0]);
      return sentReferences.length === 1 ?
        Promise.reject({type: 'FILE_REFERENCE_INVALID'}) :
        Promise.resolve(makeUpdates());
    });

    await manager.editMessage(message, '', {richMessage});

    expect(invokeApi).toHaveBeenCalledTimes(2);
    expect(referencesStorage.refreshReference).toHaveBeenCalledOnce();
    expect(sentReferences).toEqual([3, 13]);
    expect((manager as any).richMessages.has(`${peerId}_100`)).toBe(false);
  });

  test('saves incoming rich documents and photos with the message reference context', () => {
    const manager = new AppMessagesManager();
    const document = {
      _: 'document',
      id: 100,
      access_hash: '101',
      file_reference: new Uint8Array([1])
    } as any;
    const photo = {
      _: 'photo',
      id: 200,
      access_hash: '201',
      file_reference: new Uint8Array([2])
    } as any;
    const savedDocument = {...document, saved: true};
    const savedPhoto = {...photo, saved: true};
    const saveDoc = vi.fn().mockReturnValue(savedDocument);
    const savePhoto = vi.fn().mockReturnValue(savedPhoto);
    const message = {
      _: 'message',
      id: 10,
      mid: 10,
      peerId,
      peer_id: {_: 'peerUser', user_id: 42},
      pFlags: {},
      date: 0,
      message: '',
      rich_message: {
        _: 'richMessage',
        pFlags: {},
        blocks: [],
        documents: [document],
        photos: [photo]
      }
    } as Message.message;

    Object.assign(manager as any, {
      appDocsManager: {saveDoc},
      appPhotosManager: {savePhoto},
      appMessagesIdsManager: {generateMessageId: (id: number) => id},
      appPeersManager: {
        peerId: (99 as UserId).toPeerId(false),
        getPeerId: () => peerId
      }
    });
    vi.spyOn(manager, 'setMessageUnreadByDialog').mockImplementation(() => {});
    vi.spyOn(manager, 'saveMessageMedia').mockImplementation(() => false);
    vi.spyOn(manager, 'setMessageToStorage').mockImplementation((storage) => storage as any);

    manager.saveMessage(message, {storage: {} as any});

    const context = {type: 'messageRich', peerId, messageId: 10};
    expect(saveDoc).toHaveBeenCalledWith(document, context);
    expect(savePhoto).toHaveBeenCalledWith(photo, context);
    expect(message.rich_message.documents).toEqual([savedDocument]);
    expect(message.rich_message.photos).toEqual([savedPhoto]);
  });

  test('saves an empty-string draft through inputRichMessage', async() => {
    const manager = new AppDraftsManager();
    const invokeApi = vi.fn().mockResolvedValue(true);
    const richMessage = makeRichMessage();
    const localDraft: DraftMessage.draftMessage = {
      _: 'draftMessage',
      pFlags: {no_webpage: true},
      date: 0,
      message: '',
      rich_message: richMessage.output
    };
    const resolveInputRichMessage = vi.fn((input: InputRichMessage) => input);
    const assertRichMessage = vi.fn().mockResolvedValue(undefined);
    const invokeWithRichMessageReferenceRetry = vi.fn((_input, invoke) => invoke());

    Object.assign(manager as any, {
      apiManager: {invokeApi},
      appMessagesManager: {
        assertRichMessage,
        resolveInputRichMessage,
        invokeWithRichMessageReferenceRetry
      },
      appPeersManager: {getInputPeerById: () => inputPeer},
      dialogsStorage: {getDialogOnly: () => ({top_message: 1})},
      drafts: {},
      timeManager: {getServerTimeOffset: () => 0, getServerTime: () => Math.floor(Date.now() / 1000)}
    });
    vi.spyOn(manager, 'saveDraft').mockImplementation(({draft}) => draft as any);

    await manager.syncDraft({
      peerId,
      localDraft,
      inputRichMessage: richMessage.input
    });

    expect(resolveInputRichMessage).toHaveBeenCalledWith(richMessage.input);
    expect(assertRichMessage).toHaveBeenCalledWith(richMessage.input, {draft: true});
    expect(invokeWithRichMessageReferenceRetry).toHaveBeenCalledWith(
      richMessage.input,
      expect.any(Function)
    );
    expect(invokeApi).toHaveBeenCalledTimes(1);
    const [method, params] = invokeApi.mock.calls[0];
    expect(method).toBe('messages.saveDraft');
    expect(params.message).toBe('');
    expect(params.entities).toBeUndefined();
    expect(params.rich_message).toBe(richMessage.input);
  });

  test('persists a rich draft locally before resolving its cloud references', async() => {
    const manager = new AppDraftsManager();
    const richMessage = makeRichMessage();
    const localDraft: DraftMessage.draftMessage = {
      _: 'draftMessage',
      pFlags: {},
      date: 0,
      message: '',
      rich_message: richMessage.output
    };
    const missingReferenceError = new Error('RICH_MESSAGE_REFERENCES_MISSING');
    const resolveInputRichMessage = vi.fn(() => {
      expect(manager.getDraft(peerId)).toBe(localDraft);
      throw missingReferenceError;
    });
    const invokeApi = vi.fn().mockResolvedValue(true);

    Object.assign(manager as any, {
      apiManager: {invokeApi},
      appMessagesManager: {
        assertRichMessage: vi.fn(),
        resolveInputRichMessage,
        invokeWithRichMessageReferenceRetry: vi.fn((_input, invoke) => invoke())
      },
      appPeersManager: {getInputPeerById: () => inputPeer},
      appStateManager: {storage: {set: vi.fn()}},
      dialogsStorage: {getDialogOnly: () => ({top_message: 1})},
      drafts: {},
      rootScope: {dispatchEvent: vi.fn()},
      timeManager: {getServerTimeOffset: () => 0, getServerTime: () => Math.floor(Date.now() / 1000)}
    });

    await expect(manager.syncDraft({
      peerId,
      localDraft,
      inputRichMessage: richMessage.input
    })).rejects.toBe(missingReferenceError);

    expect(manager.getDraft(peerId)).toBe(localDraft);
    expect(resolveInputRichMessage).toHaveBeenCalledTimes(1);
    expect(invokeApi).not.toHaveBeenCalled();
  });

  test('caches and canonicalizes rich draft documents and photos', () => {
    const manager = new AppDraftsManager();
    const richMessage = makeRichMessage();
    const document = {_: 'document', id: 100} as any;
    const photo = {_: 'photo', id: 200} as any;
    const savedDocument = {...document, cached: true};
    const savedPhoto = {...photo, cached: true};
    richMessage.output.documents = [document];
    richMessage.output.photos = [photo];
    const localDraft: DraftMessage.draftMessage = {
      _: 'draftMessage',
      pFlags: {},
      date: 0,
      message: '',
      rich_message: richMessage.output
    };

    Object.assign(manager as any, {
      appDocsManager: {saveDoc: vi.fn(() => savedDocument)},
      appPhotosManager: {savePhoto: vi.fn(() => savedPhoto)},
      appStateManager: {storage: {set: vi.fn()}},
      drafts: {}
    });

    manager.saveDraft({peerId, draft: localDraft});

    expect(localDraft.rich_message.documents).toEqual([savedDocument]);
    expect(localDraft.rich_message.photos).toEqual([savedPhoto]);
    expect(manager.getDraft(peerId).rich_message.documents).toEqual([savedDocument]);
    expect(manager.getDraft(peerId).rich_message.photos).toEqual([savedPhoto]);
  });

  test('retries an equal locally-persisted draft after a failed cloud save', async() => {
    const manager = new AppDraftsManager();
    const richMessage = makeRichMessage();
    const localDraft: DraftMessage.draftMessage = {
      _: 'draftMessage',
      pFlags: {},
      date: 0,
      message: '',
      rich_message: richMessage.output
    };
    const cloudError = new Error('NETWORK_FAILED');
    const invokeApi = vi.fn()
    .mockRejectedValueOnce(cloudError)
    .mockResolvedValueOnce(true);

    Object.assign(manager as any, {
      apiManager: {invokeApi},
      appMessagesManager: {
        assertRichMessage: vi.fn().mockResolvedValue(undefined),
        resolveInputRichMessage: vi.fn((input: InputRichMessage) => input),
        invokeWithRichMessageReferenceRetry: vi.fn((_input, invoke) => invoke())
      },
      appPeersManager: {getInputPeerById: () => inputPeer},
      appStateManager: {storage: {set: vi.fn()}},
      dialogsStorage: {getDialogOnly: () => ({top_message: 1})},
      drafts: {},
      rootScope: {dispatchEvent: vi.fn()},
      timeManager: {getServerTimeOffset: () => 0, getServerTime: () => Math.floor(Date.now() / 1000)}
    });

    await expect(manager.syncDraft({
      peerId,
      localDraft,
      inputRichMessage: richMessage.input
    })).rejects.toBe(cloudError);

    expect(manager.getDraft(peerId)).toBe(localDraft);

    await manager.syncDraft({
      peerId,
      localDraft,
      inputRichMessage: richMessage.input
    });

    expect(invokeApi).toHaveBeenCalledTimes(2);
    expect(manager.syncDraft({
      peerId,
      localDraft,
      inputRichMessage: richMessage.input
    })).toBe(true);
    expect(invokeApi).toHaveBeenCalledTimes(2);
  });

  test('does not let a stale cloud update replace a locally saved rich draft', async() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-17T00:00:00Z'));
    try {
      const manager = new AppDraftsManager();
      const richMessage = makeRichMessage();
      const localDraft: DraftMessage.draftMessage = {
        _: 'draftMessage',
        pFlags: {},
        date: 100,
        message: '',
        rich_message: richMessage.output
      };
      const staleDraft: DraftMessage.draftMessage = {
        _: 'draftMessage',
        pFlags: {},
        date: 99,
        message: 'stale'
      };
      const cloudSave = deferredPromise<boolean>();
      let updateDraftMessage: (update: any) => void;

      Object.assign(manager as any, {
        apiManager: {invokeApi: vi.fn(() => cloudSave)},
        apiUpdatesManager: {
          addMultipleEventsListeners: (listeners: any) => {
            updateDraftMessage = listeners.updateDraftMessage;
          }
        },
        appDocsManager: {saveDoc: vi.fn((document) => document)},
        appMessagesIdsManager: {generateMessageId: (id: number) => id},
        appMessagesManager: {
          assertRichMessage: vi.fn().mockResolvedValue(undefined),
          resolveInputRichMessage: vi.fn((input: InputRichMessage) => input),
          invokeWithRichMessageReferenceRetry: vi.fn((_input, invoke) => invoke())
        },
        appPeersManager: {
          getInputPeerById: () => inputPeer,
          getPeerId: () => peerId,
          isChannel: () => false,
          isMonoforum: () => false
        },
        appPhotosManager: {savePhoto: vi.fn((photo) => photo)},
        appStateManager: {
          storage: {
            get: vi.fn().mockResolvedValue({}),
            set: vi.fn()
          }
        },
        dialogsStorage: {getDialogOnly: () => ({top_message: 1})},
        rootScope: {dispatchEvent: vi.fn(), myId: 1},
        timeManager: {getServerTimeOffset: () => 0, getServerTime: () => Math.floor(Date.now() / 1000)}
      });

      (manager as any).after();
      await Promise.resolve();
      const save = manager.syncDraft({
        peerId,
        localDraft,
        inputRichMessage: richMessage.input
      }) as Promise<unknown>;

      updateDraftMessage!({
        peer: inputPeer,
        draft: staleDraft
      });
      expect(manager.getDraft(peerId)).toBe(localDraft);

      cloudSave.resolve(true);
      await save;
      updateDraftMessage!({
        peer: inputPeer,
        draft: staleDraft
      });
      expect(manager.getDraft(peerId)).toBe(localDraft);

      vi.advanceTimersByTime(2001);
      updateDraftMessage!({
        peer: inputPeer,
        draft: staleDraft
      });
      expect(manager.getDraft(peerId)).toBe(staleDraft);
    } finally {
      vi.useRealTimers();
    }
  });

  test('restores a locally persisted rich draft after a manager restart', async() => {
    const richMessage = tiptapToRichMessage(
      createChatInputEditorTestData({includeLocalMediaPreview: false}),
      {draft: true}
    );
    const referenced = makeReferencedRichMessage();
    const document = {
      _: 'document',
      id: 100,
      access_hash: '101',
      file_reference: new Uint8Array([1])
    } as any;
    const photo = {
      _: 'photo',
      id: 200,
      access_hash: '201',
      file_reference: new Uint8Array([2])
    } as any;
    richMessage.output.documents = [document];
    richMessage.output.photos = [photo];
    richMessage.output.blocks.push(...referenced.output.blocks);
    const localDraft: DraftMessage.draftMessage = {
      _: 'draftMessage',
      pFlags: {no_webpage: true},
      date: 100,
      message: '',
      rich_message: richMessage.output
    };
    let storedDrafts: unknown;
    const saveStorage = {
      set: vi.fn(({drafts}: {drafts: unknown}) => {
        storedDrafts = structuredClone(drafts);
      })
    };
    const cacheManagers = {
      appDocsManager: {saveDoc: vi.fn((value: any) => value)},
      appPhotosManager: {savePhoto: vi.fn((value: any) => value)},
      appMessagesIdsManager: {generateMessageId: (id: number) => id},
      appPeersManager: {isChannel: () => false}
    };
    const writer = new AppDraftsManager();
    Object.assign(writer as any, {
      ...cacheManagers,
      appStateManager: {storage: saveStorage},
      drafts: {}
    });
    writer.saveDraft({peerId, draft: localDraft});

    const reader = new AppDraftsManager();
    Object.assign(reader as any, {
      ...cacheManagers,
      apiUpdatesManager: {addMultipleEventsListeners: vi.fn()},
      appStateManager: {
        storage: {get: vi.fn().mockResolvedValue(structuredClone(storedDrafts))}
      }
    });
    (reader as any).after();
    await Promise.resolve();

    const restored = reader.getDraft(peerId);
    expect(restored).toMatchObject({
      _: 'draftMessage',
      date: 100,
      message: '',
      pFlags: {no_webpage: true}
    });
    expect(restored.rich_message.blocks).toEqual(localDraft.rich_message.blocks);
    const restoredBlockTypes = new Set(
      restored.rich_message.blocks.map((block: PageBlock) => block._)
    );
    [
      'pageBlockParagraph',
      'pageBlockHeading1',
      'pageBlockHeading6',
      'pageBlockBlockquote',
      'pageBlockPullquote',
      'pageBlockDetails',
      'pageBlockList',
      'pageBlockOrderedList',
      'pageBlockPreformatted',
      'pageBlockTable',
      'pageBlockMath',
      'pageBlockFooter',
      'pageBlockAnchor',
      'pageBlockDivider',
      'pageBlockPhoto'
    ].forEach((type) => expect(restoredBlockTypes).toContain(type));
    const persistedText = JSON.stringify(restored.rich_message.blocks);
    [
      'textBold',
      'textItalic',
      'textUnderline',
      'textStrike',
      'textFixed',
      'textSpoiler',
      'textMarked',
      'textSubscript',
      'textSuperscript',
      'textUrl',
      'textMentionName',
      'textDate',
      'textMath',
      'textCustomEmoji'
    ].forEach((type) => expect(persistedText).toContain(`\"_\":\"${type}\"`));
    expect(restored.rich_message.documents).toMatchObject([{
      _: 'document',
      id: 100,
      access_hash: '101'
    }]);
    const restoredDocument = restored.rich_message.documents[0];
    expect(restoredDocument._).toBe('document');
    if(restoredDocument._ !== 'document') throw new Error('Expected persisted document');
    expect(Array.from(restoredDocument.file_reference)).toEqual([1]);
    expect(restored.rich_message.photos).toMatchObject([{
      _: 'photo',
      id: 200,
      access_hash: '201'
    }]);
    const restoredPhoto = restored.rich_message.photos[0];
    expect(restoredPhoto._).toBe('photo');
    if(restoredPhoto._ !== 'photo') throw new Error('Expected persisted photo');
    expect(Array.from(restoredPhoto.file_reference)).toEqual([2]);
  });
});
