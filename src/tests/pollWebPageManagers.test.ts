import {AppPollsManager} from '@appManagers/appPollsManager';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppWebPagesManager} from '@appManagers/appWebPagesManager';
import {CreatePollPayload} from '@components/popups/createPoll/storeContext';
import {InputMedia, Message, MessageEntity, MessageMedia, MessagesWebPagePreview, Poll, PollAnswer, PollResults, WebPage} from '@layer';


function makeWebPage(id: number, url = `https://example.com/${id}`): WebPage.webPage {
  return {
    _: 'webPage',
    pFlags: {},
    id,
    url,
    display_url: url,
    hash: id
  };
}

function makePoll(id: number, webPageIds: number[]): Poll.poll {
  return {
    _: 'poll',
    id,
    pFlags: {},
    question: {_: 'textWithEntities', text: 'Question', entities: []},
    answers: webPageIds.map((webPageId, index) => ({
      _: 'pollAnswer',
      text: {_: 'textWithEntities', text: `Answer ${index}`, entities: [] as MessageEntity[]},
      option: new Uint8Array([index]),
      media: {
        _: 'messageMediaWebPage',
        pFlags: {},
        webpage: makeWebPage(webPageId)
      }
    })),
    hash: id
  };
}

function makeResults(): PollResults.pollResults {
  return {_: 'pollResults', pFlags: {}};
}

function makePollMessage(poll: Poll.poll, attachedMedia?: MessageMedia, isScheduled = false): Message.message {
  return {
    _: 'message',
    id: 1,
    peer_id: {_: 'peerUser', user_id: 1},
    date: 0,
    message: '',
    pFlags: {is_scheduled: isScheduled || undefined},
    media: {_: 'messageMediaPoll', poll, results: makeResults(), attached_media: attachedMedia},
    peerId: 1,
    mid: 1,
    storageKey: isScheduled ? '1_scheduled' : '1_history'
  } as any as Message.message;
}

function makePollsManager(messages: Message.message[] = []) {
  const listeners = new Map<string, (payload: any) => void>();
  const dispatched: Array<{event: string, payload: any}> = [];
  const saveMessageMedia = vi.fn();
  const manager = new AppPollsManager();

  Object.assign(manager as any, {
    apiUpdatesManager: {addMultipleEventsListeners: () => {}},
    appMessagesManager: {
      saveMessageMedia,
      getMessageByPeer: (peerId: PeerId, mid: number) =>
        messages.find((message) => !message.pFlags.is_scheduled && message.peerId === peerId && message.mid === mid),
      getScheduledMessageByPeer: (peerId: PeerId, mid: number) =>
        messages.find((message) => message.pFlags.is_scheduled && message.peerId === peerId && message.mid === mid)
    },
    appWebPagesManager: {getCachedWebPage: (): WebPage => undefined},
    rootScope: {
      addEventListener: (event: string, callback: (payload: any) => void) => listeners.set(event, callback),
      dispatchEvent: (event: string, payload: any) => dispatched.push({event, payload})
    },
    log: () => {}
  });
  (manager as any).after();

  return {manager, listeners, dispatched, saveMessageMedia};
}

function makeWebPagesManager(invokeApiSingle: (method: string, params: {message: string}) => Promise<MessagesWebPagePreview>) {
  const manager = new AppWebPagesManager();
  Object.assign(manager as any, {
    apiManager: {invokeApiSingle},
    appPeersManager: {saveApiPeers: () => {}},
    appPhotosManager: {savePhoto: (photo: any) => photo},
    appDocsManager: {saveDoc: (doc: any) => doc},
    rootScope: {dispatchEvent: () => {}},
    log: Object.assign(() => {}, {warn: () => {}})
  });
  return manager;
}

describe('AppPollsManager webpage index', () => {
  test('unindexes webpages when the last message for a poll is removed', () => {
    const {manager} = makePollsManager();
    const poll = makePoll(1, [10, 20]);
    const message = makePollMessage(poll);
    manager.savePoll(poll, makeResults(), message);
    manager.savePoll(makePoll(2, [10]), makeResults());

    manager.updatePollToMessage(message, false);

    const pollIdsByWebPageId = (manager as any).pollIdsByWebPageId as Map<number, Set<number>>;
    const webPageIdsByPollId = (manager as any).webPageIdsByPollId as Map<number, Set<number>>;
    expect(pollIdsByWebPageId.get(10)).toEqual(new Set([2]));
    expect(pollIdsByWebPageId.has(20)).toBe(false);
    expect(webPageIdsByPollId.has(1)).toBe(false);
    expect(webPageIdsByPollId.get(2)).toEqual(new Set([10]));
    expect(manager.getPoll(poll.id)).toEqual({poll: undefined, results: undefined});
  });

  test('unindexes a poll webpage after it resolves to empty', () => {
    const {manager, listeners, dispatched} = makePollsManager();
    const poll = makePoll(1, [10]);
    manager.savePoll(poll, makeResults());

    (manager as any).appWebPagesManager.getCachedWebPage = () => ({
      _: 'webPageEmpty',
      id: 10,
      url: 'https://example.com/10'
    });
    listeners.get('webpage_updated')({id: 10});

    const media = (poll.answers[0] as PollAnswer.pollAnswer).media as MessageMedia.messageMediaWebPage;
    expect(media.webpage).toMatchObject({_: 'webPageEmpty', id: 10, url: 'https://example.com/10'});
    expect((manager as any).pollIdsByWebPageId.has(10)).toBe(false);
    expect(dispatched).toContainEqual({event: 'poll_update', payload: {poll, results: manager.results[poll.id]}});
  });

  test('sends webpage media in the poll answer instead of attached_media', async() => {
    const {manager} = makePollsManager();
    const invokeApi = vi.fn(async(_method: string, _params: {media: InputMedia.inputMediaPoll}) => ({_: 'updatesTooLong'}));
    Object.assign(manager as any, {
      apiManager: {invokeApi},
      apiUpdatesManager: {
        processUpdateMessage: vi.fn(),
        processPaidMessageUpdate: vi.fn()
      },
      appMessagesManager: {
        getInputEntities: (): undefined => undefined
      },
      appPeersManager: {
        getInputPeerById: () => ({_: 'inputPeerSelf'}),
        getOutputPeer: () => ({_: 'peerUser', user_id: 1})
      },
      appPollsManager: {
        savePoll: (poll: Poll.poll, results: PollResults.pollResults) => ({poll, results})
      }
    });

    const link = {type: 'link' as const, url: 'https://example.com'};
    const payload: CreatePollPayload = {
      question: 'Question',
      questionEntities: [],
      description: 'Description',
      descriptionEntities: [],
      descriptionAttachment: link,
      pollOptions: [
        {text: 'One', entities: [], attachment: link},
        {text: 'Two', entities: []}
      ],
      showWhoVoted: true,
      allowMultipleAnswers: false,
      allowAddingOptions: false,
      allowRevoting: true,
      shuffleOptions: false,
      hasCorrectAnswer: false,
      restrictToSubscribers: true,
      limitByCountry: true,
      countriesIso2: ['US', 'FT'],
      durationLimited: false,
      explanation: '',
      explanationEntities: [],
      explanationAttachment: link,
      hideResults: false
    };
    const uploadingMedia = (manager as any).startUploadingAllPollMedia(1, payload);
    const parsedPayload = (manager as any).parseAllPollMarkdown(payload);
    const {pollWithoutAnswers} = (manager as any).makePollMedia({
      peerId: 1,
      payload,
      parsedPayload,
      uploadingMedia
    });

    await (manager as any).invokeSendPoll({
      peerId: 1,
      params: {},
      randomId: '1',
      pollWithoutAnswers,
      payload,
      parsedPayload,
      uploadingMedia
    });

    const sentMedia = invokeApi.mock.calls[0]![1].media;
    expect(sentMedia.attached_media).toBeUndefined();
    expect(sentMedia.solution_media).toBeUndefined();
    expect(sentMedia.poll.pFlags.subscribers_only).toBe(true);
    expect(sentMedia.poll.countries_iso2).toEqual(['US', 'FT']);
    expect(sentMedia.poll.answers[0].media).toEqual({
      _: 'inputMediaWebPage',
      pFlags: {optional: true},
      url: link.url
    });
    expect(sentMedia.poll.answers[0]._).toBe('inputPollAnswer');
    expect(sentMedia.poll.answers[1].media).toBeUndefined();
    expect(sentMedia.poll.answers[1]).toMatchObject({
      _: 'pollAnswer',
      option: new Uint8Array([49])
    });
  });

  test('preserves and converts all poll media when stopping a poll', async() => {
    const {manager} = makePollsManager();
    const poll = makePoll(1, [10]);
    poll.pFlags.quiz = true;
    poll.chosenIndexes = [0];
    poll.correctIndexes = [0];
    poll.answers.push({
      _: 'pollAnswer',
      flags: 3,
      text: {_: 'textWithEntities', text: 'Plain answer', entities: []},
      option: new Uint8Array([1]),
      added_by: {_: 'peerUser', user_id: 99},
      date: 123
    });
    poll.answers.push({
      _: 'pollAnswer',
      text: {_: 'textWithEntities', text: 'Geo answer', entities: []},
      option: new Uint8Array([2]),
      media: {
        _: 'messageMediaGeo',
        geo: {
          _: 'geoPoint',
          lat: 25.2048,
          long: 55.2708,
          access_hash: 40,
          accuracy_radius: 15
        }
      }
    });

    const attachedMedia: MessageMedia.messageMediaPhoto = {
      _: 'messageMediaPhoto',
      pFlags: {},
      photo: {
        _: 'photo',
        pFlags: {},
        id: 20,
        access_hash: 21,
        file_reference: new Uint8Array([22]),
        date: 0,
        sizes: [],
        dc_id: 1
      }
    };
    const solutionMedia: MessageMedia.messageMediaDocument = {
      _: 'messageMediaDocument',
      pFlags: {},
      document: {
        _: 'document',
        pFlags: {},
        id: 30,
        access_hash: 31,
        file_reference: new Uint8Array([32]),
        date: 0,
        dc_id: 1,
        attributes: []
      }
    };
    const message = makePollMessage(poll, attachedMedia);
    const solutionEntity: MessageEntity = {_: 'messageEntityBold', offset: 0, length: 8};
    manager.results[poll.id] = {
      _: 'pollResults',
      pFlags: {},
      solution: 'Solution',
      solution_entities: [solutionEntity],
      solution_media: solutionMedia
    };

    const editMessage = vi.fn(async(
      _message: Message.message,
      _text: undefined,
      _options: {newMedia: InputMedia}
    ) => undefined);
    Object.assign(manager as any, {
      appMessagesManager: {editMessage},
      log: Object.assign(() => {}, {error: vi.fn()})
    });

    await manager.stopPoll(message);

    const newMedia = editMessage.mock.calls[0]![2].newMedia as InputMedia.inputMediaPoll;
    expect(newMedia.poll).not.toHaveProperty('chosenIndexes');
    expect(newMedia.poll).not.toHaveProperty('correctIndexes');
    expect(newMedia.poll).toMatchObject({
      hash: 0,
      pFlags: {quiz: true, closed: true}
    });
    expect(newMedia.poll.answers[0]).toEqual({
      _: 'inputPollAnswer',
      text: poll.answers[0].text,
      media: {
        _: 'inputMediaWebPage',
        pFlags: {optional: true},
        url: 'https://example.com/10'
      }
    });
    expect(newMedia.poll.answers[1]).toEqual({
      _: 'pollAnswer',
      text: poll.answers[1].text,
      option: new Uint8Array([1])
    });
    expect(newMedia.poll.answers[2]).toEqual({
      _: 'inputPollAnswer',
      text: poll.answers[2].text,
      media: {
        _: 'inputMediaGeoPoint',
        geo_point: {
          _: 'inputGeoPoint',
          lat: 25.2048,
          long: 55.2708,
          accuracy_radius: 15
        }
      }
    });
    expect(newMedia.correct_answers).toEqual([0]);
    expect(newMedia.attached_media).toEqual({
      _: 'inputMediaPhoto',
      pFlags: {},
      id: {
        _: 'inputPhoto',
        id: 20,
        access_hash: 21,
        file_reference: new Uint8Array([22])
      }
    });
    expect(newMedia.solution).toBe('Solution');
    expect(newMedia.solution_entities).toEqual([solutionEntity]);
    expect(newMedia.solution_media).toEqual({
      _: 'inputMediaDocument',
      pFlags: {},
      id: {
        _: 'inputDocument',
        id: 30,
        access_hash: 31,
        file_reference: new Uint8Array([32])
      }
    });
  });

  test('indexes and updates webpage media in answers, solution and description', () => {
    const poll = makePoll(1, [10]);
    const results = makeResults();
    results.solution_media = {
      _: 'messageMediaWebPage',
      pFlags: {},
      webpage: makeWebPage(20)
    };
    const attachedMedia: MessageMedia.messageMediaWebPage = {
      _: 'messageMediaWebPage',
      pFlags: {},
      webpage: makeWebPage(30)
    };
    const message = makePollMessage(poll, attachedMedia);
    const {manager, listeners, dispatched} = makePollsManager([message]);
    manager.savePoll(poll, results, message);

    const pollIdsByWebPageId = (manager as any).pollIdsByWebPageId as Map<number, Set<number>>;
    expect([...pollIdsByWebPageId.keys()]).toEqual([10, 20, 30]);

    (manager as any).appWebPagesManager.getCachedWebPage = (id: number) => makeWebPage(id, `https://updated.example/${id}`);
    listeners.get('webpage_updated')({id: 20});
    listeners.get('webpage_updated')({id: 30});

    expect((results.solution_media as MessageMedia.messageMediaWebPage).webpage).toMatchObject({url: 'https://updated.example/20'});
    expect(attachedMedia.webpage).toMatchObject({url: 'https://updated.example/30'});
    expect(dispatched.filter(({event}) => event === 'poll_update')).toHaveLength(2);
    expect(dispatched.filter(({event}) => event === 'message_edit')).toHaveLength(1);
  });

  test('keeps scheduled poll descriptions indexed after a reindex', () => {
    const poll = makePoll(1, []);
    const results = makeResults();
    const attachedMedia: MessageMedia.messageMediaWebPage = {
      _: 'messageMediaWebPage',
      pFlags: {},
      webpage: makeWebPage(30)
    };
    const message = makePollMessage(poll, attachedMedia, true);
    const {manager, listeners, dispatched} = makePollsManager([message]);

    manager.savePoll(poll, results, message);
    manager.savePoll(poll, results);

    expect(manager.pollToMessages[poll.id]).toEqual(new Set(['1_1_s']));
    expect((manager as any).pollIdsByWebPageId.get(30)).toEqual(new Set([poll.id]));

    (manager as any).appWebPagesManager.getCachedWebPage = () => makeWebPage(30, 'https://updated.example/30');
    listeners.get('webpage_updated')({id: 30});

    expect(attachedMedia.webpage).toMatchObject({url: 'https://updated.example/30'});
    expect(dispatched.filter(({event}) => event === 'message_edit')).toHaveLength(1);
  });

  test('preserves empty webpage placeholders in answers and solution', () => {
    const poll = makePoll(1, []);
    poll.answers = [{
      _: 'pollAnswer',
      text: {_: 'textWithEntities', text: 'Answer', entities: []},
      option: new Uint8Array([0]),
      media: {
        _: 'messageMediaWebPage',
        pFlags: {},
        webpage: {_: 'webPageEmpty', id: 0, url: 'https://answer.example'}
      }
    }];
    const results = makeResults();
    results.solution_media = {
      _: 'messageMediaWebPage',
      pFlags: {},
      webpage: {_: 'webPageEmpty', id: 0, url: 'https://solution.example'}
    };
    const {manager, saveMessageMedia} = makePollsManager();

    manager.savePoll(poll, results);

    expect(saveMessageMedia).not.toHaveBeenCalled();
    expect((poll.answers[0] as PollAnswer.pollAnswer).media).toMatchObject({
      webpage: {_: 'webPageEmpty', url: 'https://answer.example'}
    });
    expect(results.solution_media).toMatchObject({
      webpage: {_: 'webPageEmpty', url: 'https://solution.example'}
    });
  });

  test('preserves an empty webpage placeholder in attached poll media', () => {
    const poll = makePoll(1, []);
    const results = makeResults();
    const attachedMedia: MessageMedia.messageMediaWebPage = {
      _: 'messageMediaWebPage',
      pFlags: {},
      webpage: {_: 'webPageEmpty', id: 0, url: 'https://description.example'}
    };
    const media: MessageMedia.messageMediaPoll = {
      _: 'messageMediaPoll',
      poll,
      results,
      attached_media: attachedMedia
    };
    const manager = new AppMessagesManager();
    Object.assign(manager as any, {
      appPollsManager: {savePoll: () => ({poll, results})}
    });

    manager.saveMessageMedia({media}, 'media');

    expect(media.attached_media).toBe(attachedMedia);
    expect(attachedMedia.webpage).toMatchObject({
      _: 'webPageEmpty',
      url: 'https://description.example'
    });
  });
});

describe('AppWebPagesManager preview cache', () => {
  const emptyPreview: MessagesWebPagePreview = {
    _: 'messages.webPagePreview',
    media: {_: 'messageMediaEmpty'},
    chats: [],
    users: []
  };

  test('dispatches webpage_updated without pending messages', () => {
    const manager = makeWebPagesManager(async() => emptyPreview);
    const dispatchEvent = vi.fn();
    (manager as any).rootScope.dispatchEvent = dispatchEvent;
    manager.saveWebPage(makeWebPage(10));
    manager.saveWebPage({...makeWebPage(10), hash: 11});

    expect(dispatchEvent).toHaveBeenCalledWith('webpage_updated', {id: 10, msgs: []});
  });

  test('keeps preview-cache webpages bound to the canonical cached object', async() => {
    const previewPage = {...makeWebPage(10), hash: 2, title: 'Preview'};
    const preview: MessagesWebPagePreview = {
      _: 'messages.webPagePreview',
      media: {_: 'messageMediaWebPage', pFlags: {}, webpage: previewPage},
      chats: [],
      users: []
    };
    const manager = makeWebPagesManager(vi.fn(async() => preview));
    const canonicalPage = {...makeWebPage(10), hash: 1, title: 'Initial'};
    manager.saveWebPage(canonicalPage);

    const first = await manager.getWebPagePreview(previewPage.url);
    const updatedPage = {...makeWebPage(10), hash: 3, title: 'Updated'};
    manager.saveWebPage(updatedPage);
    const cached = await manager.getWebPagePreview(previewPage.url);

    expect(first.webpage).toBe(canonicalPage);
    expect(cached.webpage).toBe(canonicalPage);
    expect((cached.webpage as WebPage.webPage).title).toBe('Updated');
  });

  test('resolves pending webpages to empty and preserves their URL', () => {
    const manager = makeWebPagesManager(async() => emptyPreview);
    const dispatchEvent = vi.fn();
    (manager as any).rootScope.dispatchEvent = dispatchEvent;
    const pending: WebPage.webPagePending = {
      _: 'webPagePending',
      id: 10,
      date: 1,
      url: 'https://example.com/10'
    };
    const messageKey = manager.getMessageKeyForPendingWebPage(1, 2, true);
    manager.saveWebPage(pending, messageKey);

    const resolved = manager.saveWebPage({_: 'webPageEmpty', id: 10});

    expect(resolved).toBe(pending);
    expect(resolved).toMatchObject({_: 'webPageEmpty', id: 10, url: 'https://example.com/10'});
    expect(dispatchEvent).toHaveBeenCalledWith('webpage_updated', {
      id: 10,
      msgs: [{peerId: 1, mid: 2, isScheduled: true}]
    });
  });
});
