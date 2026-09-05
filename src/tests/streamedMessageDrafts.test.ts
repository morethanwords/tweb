import {RichMessage, RichText, TextWithEntities} from '@layer';
import StreamedMessageDrafts, {
  StreamedMessageDraft,
  StreamedMessageDraftContent,
  chooseStreamedMessageDraftForFinal,
  getStreamedMessageContentMatchText
} from '@appManagers/utils/messages/streamedMessageDrafts';

const peerId = 10 as PeerId;
const authorId = 20 as PeerId;
type TextContent = Extract<StreamedMessageDraftContent, {kind: 'text'}>;

function text(value: string): TextWithEntities {
  return {_: 'textWithEntities', text: value, entities: []};
}

function textContent(value: string): TextContent {
  return {kind: 'text', text: text(value)};
}

function richContent(value: string): StreamedMessageDraftContent {
  const richText: RichText = {_: 'textPlain', text: value};
  const richMessage: RichMessage = {
    _: 'richMessage',
    pFlags: {},
    blocks: [{_: 'pageBlockParagraph', text: richText}],
    photos: [],
    documents: []
  };
  return {kind: 'rich', richMessage};
}

function upsert(
  drafts: StreamedMessageDrafts,
  content: StreamedMessageDraftContent,
  options: Partial<{
    peerId: PeerId,
    threadId: number,
    authorId: PeerId,
    randomId: string,
    tempId: number,
    date: number,
    now: number,
    ttl: number
  }> = {}
) {
  return drafts.upsert({
    peerId: options.peerId ?? peerId,
    threadId: options.threadId ?? 7,
    authorId: options.authorId ?? authorId,
    randomId: options.randomId ?? '100',
    createTempId: () => options.tempId ?? 1.0001,
    date: options.date ?? 1_000,
    now: options.now ?? 5_000,
    ttl: options.ttl ?? 30_000,
    content
  });
}

describe('StreamedMessageDrafts', () => {
  test('keeps a stable key and temp id while publishing immutable revisions', () => {
    const drafts = new StreamedMessageDrafts();
    const createTempId = vi.fn(() => 1.0001);
    const first = drafts.upsert({
      peerId,
      threadId: 7,
      authorId,
      randomId: '100',
      createTempId,
      date: 1_000,
      now: 5_000,
      ttl: 30_000,
      content: textContent('hel')
    });
    const second = drafts.upsert({
      peerId,
      threadId: 7,
      authorId,
      randomId: '100',
      createTempId,
      date: 2_000,
      now: 6_000,
      ttl: 30_000,
      content: textContent('hello')
    });

    expect(first.draft.key).toBe(second.draft.key);
    expect(first.draft.tempId).toBe(second.draft.tempId);
    expect(first.draft.revision).toBe(1);
    expect(second.draft.revision).toBe(2);
    expect((first.draft.content as TextContent).text.text).toBe('hel');
    expect((second.draft.content as TextContent).text.text).toBe('hello');
    expect(createTempId).toHaveBeenCalledTimes(1);
  });

  test('refreshes expiry without publishing a duplicate content revision', () => {
    const drafts = new StreamedMessageDrafts();
    const first = upsert(drafts, textContent('same'), {now: 1_000});
    const duplicate = upsert(drafts, textContent('same'), {now: 2_000});

    expect(duplicate.changed).toBe(false);
    expect(duplicate.draft).not.toBe(first.draft);
    expect(duplicate.draft.revision).toBe(first.draft.revision);
    expect(duplicate.draft.expiresAt).toBe(32_000);
  });

  test('supersedes only another random id in the same peer, thread and author scope', () => {
    const drafts = new StreamedMessageDrafts();
    const first = upsert(drafts, textContent('first'));
    const otherThread = upsert(drafts, textContent('other thread'), {threadId: 8, randomId: '200'});
    const replacement = upsert(drafts, textContent('replacement'), {randomId: '300'});

    expect(replacement.removed).toEqual([first.draft]);
    expect(drafts.size).toBe(2);
    expect(drafts.adopt({
      peerId,
      threadId: 8,
      authorId,
      kind: 'text',
      matchText: 'other thread done'
    })).toEqual(otherThread.draft);
  });

  test('expires drafts independently and reports the next deadline', () => {
    const drafts = new StreamedMessageDrafts();
    const first = upsert(drafts, textContent('first'), {now: 1_000, ttl: 5_000});
    upsert(drafts, textContent('second'), {
      threadId: 8,
      randomId: '200',
      now: 2_000,
      ttl: 10_000
    });

    expect(drafts.getNextExpiration()).toBe(6_000);
    expect(drafts.expire(5_999)).toEqual([]);
    expect(drafts.expire(6_000)).toEqual([first.draft]);
    expect(drafts.getNextExpiration()).toBe(12_000);
  });

  test('tombstones an adopted random id until its draft ttl expires', () => {
    const drafts = new StreamedMessageDrafts();
    const draft = upsert(drafts, textContent('complete')).draft;
    const adopted = drafts.adopt({
      peerId,
      threadId: 7,
      authorId,
      kind: 'text',
      matchText: 'complete result'
    });
    drafts.markFinalized(adopted, 35_000);

    expect(drafts.isFinalized(draft, 34_999)).toBe(true);
    expect(drafts.getNextExpiration()).toBe(35_000);
    drafts.expire(35_000);
    expect(drafts.isFinalized(draft, 35_000)).toBe(false);
    expect(drafts.getNextExpiration()).toBeUndefined();
  });

  test('removes active drafts and finalized tombstones only for the flushed peer', () => {
    const drafts = new StreamedMessageDrafts();
    const removedDraft = upsert(drafts, textContent('removed')).draft;
    const finalizedDraft = upsert(drafts, textContent('finalized'), {
      threadId: 8,
      randomId: '200'
    }).draft;
    const preservedDraft = upsert(drafts, textContent('preserved'), {
      peerId: 11 as PeerId,
      randomId: '300'
    }).draft;
    drafts.removeByKey(finalizedDraft.key);
    drafts.markFinalized(finalizedDraft, 35_000);

    expect(drafts.removePeer(peerId)).toEqual([removedDraft]);
    expect(drafts.isFinalized(finalizedDraft, 10_000)).toBe(false);
    expect(drafts.size).toBe(1);
    expect(drafts.adopt({
      peerId: preservedDraft.peerId,
      threadId: preservedDraft.threadId,
      authorId: preservedDraft.authorId,
      kind: 'text',
      matchText: 'preserved result'
    })).toEqual(preservedDraft);
  });

  test('matches rich drafts with newest-rich and cross-kind fallbacks inside the scope', () => {
    const drafts = new StreamedMessageDrafts();
    const rich = upsert(drafts, richContent('Streaming rich'));

    expect(getStreamedMessageContentMatchText(rich.draft.content)).toBe('Streaming rich');
    expect(drafts.adopt({
      peerId,
      threadId: 8,
      authorId,
      kind: 'rich',
      matchText: 'Streaming rich complete'
    })).toBeUndefined();
    expect(drafts.adopt({
      peerId,
      threadId: 7,
      authorId,
      kind: 'rich',
      matchText: 'Unrelated rich'
    })).toEqual(rich.draft);

    const crossKind = upsert(drafts, richContent('Cross-kind stream'), {randomId: '200'});
    expect(drafts.adopt({
      peerId,
      threadId: 7,
      authorId,
      kind: 'text',
      matchText: 'Cross-kind stream final'
    })).toEqual(crossKind.draft);
  });

  test('adopts a rewritten suffix after any stable prefix', () => {
    const drafts = new StreamedMessageDrafts();
    const draft = upsert(drafts, textContent('The result is forty two')).draft;

    expect(drafts.adopt({
      peerId,
      threadId: 7,
      authorId,
      kind: 'text',
      matchText: 'Completely different'
    })).toBeUndefined();
    expect(drafts.adopt({
      peerId,
      threadId: 7,
      authorId,
      kind: 'text',
      matchText: 'The result is 42'
    })).toEqual(draft);
  });

  test('prefers same-kind content, supports a kind transition and never matches empty plain text', () => {
    const drafts = new StreamedMessageDrafts();
    const textDraft = upsert(drafts, textContent('shared text')).draft;
    const richDraft: StreamedMessageDraft = {
      ...textDraft,
      key: 'another-key',
      randomId: '200',
      tempId: 2.0001,
      updatedAt: textDraft.updatedAt + 1,
      content: richContent('shared rich')
    };

    expect(chooseStreamedMessageDraftForFinal([textDraft, richDraft], {
      peerId,
      threadId: 7,
      authorId,
      kind: 'rich',
      matchText: 'shared rich final'
    })).toEqual(richDraft);
    expect(chooseStreamedMessageDraftForFinal([textDraft], {
      peerId,
      threadId: 7,
      authorId,
      kind: 'rich',
      matchText: 'shared text final'
    })).toEqual(textDraft);
    expect(chooseStreamedMessageDraftForFinal([
      {...textDraft, content: textContent('')}
    ], {
      peerId,
      threadId: 7,
      authorId,
      kind: 'text',
      matchText: ''
    })).toBeUndefined();
  });

  test('uses the newest rich draft when a rich final has no comparable text', () => {
    const drafts = new StreamedMessageDrafts();
    const first = upsert(drafts, richContent('first')).draft;
    const second: StreamedMessageDraft = {
      ...first,
      key: 'second',
      randomId: '200',
      tempId: 2.0001,
      updatedAt: first.updatedAt + 1,
      content: richContent('second')
    };

    expect(chooseStreamedMessageDraftForFinal([first, second], {
      peerId,
      threadId: 7,
      authorId,
      kind: 'rich',
      matchText: ''
    })).toEqual(second);
  });
});
