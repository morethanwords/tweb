import {Message, MessageMedia} from '@layer';
import {getSolidMessageBodyStructure} from '@components/chat/bubbleParts/solidMessageShell';
import createWidgetEditHandler, {createPendingWidgetEditHandler} from '@components/chat/bubbleParts/widgetEdit';

const peerId = 10 as PeerId;

const widget = (fields: Partial<MessageMedia.messageMediaWidget> = {}): MessageMedia.messageMediaWidget => ({
  _: 'messageMediaWidget',
  pFlags: {can_query: true},
  width: 300,
  height: 0,
  payload: new Uint8Array([1, 2, 3]),
  widget_id: 5,
  ...fields
});

const message = (overrides: Partial<Message.message> = {}): Message.message => ({
  _: 'message',
  id: 1,
  mid: 1,
  peer_id: {_: 'peerChannel', channel_id: 2},
  peerId,
  pFlags: {post: true},
  date: 1,
  message: '',
  media: widget(),
  // * a post has views from the start (whether there are any at all is the shell's)
  views: 1,
  ...overrides
});

const factcheck: Message.message['factcheck'] = {
  _: 'factCheck',
  pFlags: {},
  hash: 1,
  country: 'US',
  text: {_: 'textWithEntities', text: 'checked', entities: []}
};

describe('a widget message\'s shell, what an edit in place keeps (the body\'s structure)', () => {
  const before = message();
  const shell = getSolidMessageBodyStructure(before);

  test('leaves out the widget\'s source and state, and what the time and the counters take in their own ways', () => {
    const after = message({
      media: widget({payload: new Uint8Array([4]), chat_data: '{"a":1}', public_data: '{"b":2}', public_data_hash: 7, flags: 3}),
      edit_date: 5,
      pFlags: {post: true, edit_hide: true, pinned: true},
      views: 10,
      forwards: 2,
      reactions: {_: 'messageReactions', pFlags: {}, results: []}
    });
    expect(getSolidMessageBodyStructure(after)).toEqual(shell);
  });

  test.each<[string, Partial<Message.message>]>([
    ['a fact check added', {factcheck}],
    ['buttons', {reply_markup: {_: 'replyInlineMarkup', pFlags: {}, rows: []}}],
    ['the caption shown above', {pFlags: {post: true, invert_media: true}}],
    ['the widget\'s width', {media: widget({width: 400})}],
    ['the widget\'s height', {media: widget({height: 200})}],
    ['the widget\'s flags', {media: widget({pFlags: {}})}],
    ['a shared widget\'s id', {media: widget({widget_id: 6})}],
    ['a restriction', {restriction_reason: [{_: 'restrictionReason', platform: 'all', reason: 'x', text: 'x'}]}],
    ['a lifetime', {ttl_period: 60}],
    ['a forward', {fwd_from: {_: 'messageFwdHeader', pFlags: {}, date: 1}}]
  ])('takes in %s', (_, overrides) => {
    expect(getSolidMessageBodyStructure(message(overrides))).not.toEqual(shell);
  });

  test('leaves out the caption\'s text, which the body takes, not whether there is one', () => {
    const captioned = getSolidMessageBodyStructure(message({message: 'one'}));
    expect(getSolidMessageBodyStructure(message({message: 'two', entities: [{_: 'messageEntityBold', offset: 0, length: 3}]}))).toEqual(captioned);
    expect(shell).not.toEqual(captioned);
  });

  test('takes in a fact check changed or gone', () => {
    const checked = getSolidMessageBodyStructure(message({factcheck}));
    expect(getSolidMessageBodyStructure(message({factcheck: {...factcheck, hash: 2}}))).not.toEqual(checked);
    expect(getSolidMessageBodyStructure(message())).not.toEqual(checked);
  });
});

describe('a widget\'s bubble taking an edit', () => {
  const stateA = '{"step":"a"}', stateB = '{"step":"b"}';
  const make = (first: Message.message) => {
    const on = {data: vi.fn(), source: vi.fn(), dated: vi.fn()};
    return {on, take: createWidgetEditHandler(first, on)};
  };

  test('gives a new state to the running widget, new HTML to a new one, and says in the time it was edited', () => {
    const {on, take} = make(message({media: widget({chat_data: stateA})}));
    expect(take(message({media: widget({chat_data: stateB})}))).toBeUndefined();
    expect(on.data).toHaveBeenLastCalledWith(expect.objectContaining({chat_data: stateB}));
    expect(on.source).not.toHaveBeenCalled();
    expect(on.dated).not.toHaveBeenCalled();

    expect(take(message({media: widget({chat_data: stateB, payload: new Uint8Array([9])}), edit_date: 3}))).toBeUndefined();
    expect(on.source).toHaveBeenCalledTimes(1);
    expect(on.dated).toHaveBeenCalledTimes(1);
  });

  test('takes a caption changed with the state put back, the caption left to its body', () => {
    const {on, take} = make(message({message: 'one', media: widget({chat_data: stateA})}));
    take(message({message: 'one', media: widget({chat_data: stateB})}));
    expect(take(message({message: 'two', media: widget({chat_data: stateA}), edit_date: 3}))).toBeUndefined();
    expect(on.data).toHaveBeenLastCalledWith(expect.objectContaining({chat_data: stateA}));
  });

  test('has the bubble made anew for a caption coming or going, its shell, or its id', () => {
    expect(make(message()).take(message({message: 'now a caption'}))).toBe(false);
    expect(make(message({message: 'one'})).take(message())).toBe(false);
    expect(make(message()).take(message({factcheck}))).toBe(false);
    expect(make(message()).take(message({mid: 7}))).toBe(false);
    expect(make(message()).take(message({media: undefined}))).toBe(false);
  });
});

describe('a widget\'s bubble taking an edit before its widget runs (loading, or failed to load)', () => {
  const stateA = '{"step":"a"}', stateB = '{"step":"b"}';

  test.each<[string, Partial<Message.message>]>([
    ['a new state', {media: widget({chat_data: stateB})}],
    ['new HTML (one that loads now, say)', {media: widget({chat_data: stateA, payload: new Uint8Array([7])})}],
    ['the caption\'s text', {message: 'two'}],
    ['an edit\'s date', {edit_date: 3}],
    ['the id a sent message gets', {mid: 8}],
    ['a fact check', {factcheck}]
  ])('has the bubble made anew for %s', (_, overrides) => {
    const take = createPendingWidgetEditHandler(message({message: 'one', media: widget({chat_data: stateA})}));
    expect(take(message({message: 'one', media: widget({chat_data: stateA}), ...overrides}))).toBe(false);
  });

  test('takes what changes none of it: a reaction, views', () => {
    const take = createPendingWidgetEditHandler(message({message: 'one', media: widget({chat_data: stateA})}));
    expect(take(message({
      message: 'one',
      media: widget({chat_data: stateA}),
      views: 9,
      reactions: {_: 'messageReactions', pFlags: {}, results: []}
    }))).toBeUndefined();
  });
});
