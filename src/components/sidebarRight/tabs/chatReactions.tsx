import {Component, createSignal, createUniqueId, For, onMount, Show} from 'solid-js';
import debounce from '@helpers/schedulers/debounce';
import {ChatReactions, Reaction} from '@layer';
import {i18n, LangPackKey} from '@lib/langPack';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import RadioFieldTsx from '@components/radioFieldTsx';
import Row from '@components/rowTsx';
import Section from '@components/section';
import ReactionStickerPreview from '@components/reactionStickerPreview';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppChatReactionsTab} from '@components/solidJsTabs/tabs';

const ChatReactionsTab: Component = () => {
  const [tab] = useSuperTab<typeof AppChatReactionsTab>();
  const promiseCollector = usePromiseCollector();
  const {chatId} = tab.payload;
  const [availableReactions, setAvailableReactions] = createSignal<Awaited<ReturnType<
    typeof tab.managers.appReactionsManager.getActiveAvailableReactions
  >>>([]);
  const [chatReactions, setChatReactions] = createSignal<ChatReactions>();
  const [emoticons, setEmoticons] = createSignal(new Set<string>());
  const [isBroadcast, setIsBroadcast] = createSignal(false);
  const radioName = createUniqueId();

  const makeReactions = (values: Iterable<string>): Reaction[] => Array.from(values, (emoticon) => ({
    _: 'reactionEmoji',
    emoticon
  }));

  const getCaptionLangPackKey = (): LangPackKey => {
    if(isBroadcast()) {
      return 'EnableReactionsChannelInfo';
    }

    const current = chatReactions();
    return current?._ === 'chatReactionsAll' ?
      'EnableAllReactionsInfo' :
      (current?._ === 'chatReactionsNone' ? 'DisableReactionsInfo' : 'EnableSomeReactionsInfo');
  };

  const saveReactions = () => {
    saveReactionsDebounced.clearTimeout();

    const current = chatReactions();
    if(!current) {
      return;
    }

    let value = current;
    if(current._ === 'chatReactionsSome') {
      const reactions = makeReactions(emoticons());
      value = reactions.length ? {...current, reactions} : {_: 'chatReactionsNone'};
      setChatReactions(value);
    }

    tab.managers.appChatsManager.setChatAvailableReactions(chatId, value);
  };

  const saveReactionsDebounced = debounce(saveReactions, 3000, false, true);

  const setMode = (mode: ChatReactions['_']) => {
    let value: ChatReactions;
    let values: string[] = [];
    if(mode === 'chatReactionsAll') {
      value = {
        _: mode,
        pFlags: {allow_custom: true}
      };
    } else if(mode === 'chatReactionsNone') {
      value = {_: mode};
    } else {
      values = ['👍', '👎'];
      value = {_: mode, reactions: makeReactions(values)};
    }

    setEmoticons(new Set(values));
    setChatReactions(value);
    saveReactionsDebounced();
  };

  const setBroadcastEnabled = (enabled: boolean) => {
    if(!enabled) {
      setEmoticons(new Set<string>());
      setChatReactions({_: 'chatReactionsNone'});
      saveReactionsDebounced();
      return;
    }

    const values = emoticons().size ?
      new Set(emoticons()) :
      new Set(availableReactions().map(({reaction}) => reaction));
    setEmoticons(values);
    setChatReactions({_: 'chatReactionsSome', reactions: makeReactions(values)});
    saveReactionsDebounced();
  };

  const setReactionChecked = (emoticon: string, checked: boolean) => {
    const values = new Set(emoticons());
    if(checked) {
      values.add(emoticon);
    } else {
      values.delete(emoticon);
    }

    setEmoticons(values);
    const reactions = makeReactions(values);
    setChatReactions(reactions.length ?
      {_: 'chatReactionsSome', reactions} :
      {_: 'chatReactionsNone'}
    );
    saveReactionsDebounced();
  };

  onMount(() => {
    tab.eventListener.addEventListener('destroy', () => {
      if(saveReactionsDebounced.isDebounced()) {
        saveReactions();
      }
    }, {once: true});

    promiseCollector.collect((async() => {
      const [reactions, chatFull] = await Promise.all([
        tab.managers.appReactionsManager.getActiveAvailableReactions(),
        tab.managers.appProfileManager.getChatFull(chatId)
      ]);
      const broadcast = await tab.managers.appChatsManager.isBroadcast(chatId);
      const value: ChatReactions = chatFull._ === 'communityFull' ?
        {_: 'chatReactionsNone'} :
        chatFull.available_reactions ?? {_: 'chatReactionsNone'};
      const values = value._ === 'chatReactionsSome' ?
        value.reactions.map((reaction) => (reaction as Reaction.reactionEmoji).emoticon) :
        [];

      setAvailableReactions(reactions);
      setIsBroadcast(broadcast);
      setEmoticons(new Set(values));
      setChatReactions(value);
    })());
  });

  const modes: [ChatReactions['_'], LangPackKey][] = [
    ['chatReactionsAll', 'AllReactions'],
    ['chatReactionsSome', 'SomeReactions'],
    ['chatReactionsNone', 'NoReactions']
  ];

  return (
    <Show when={chatReactions()}>
      <Section
        name={isBroadcast() ? undefined : 'AvailableReactions'}
        caption={getCaptionLangPackKey()}
      >
        <Show when={isBroadcast()} fallback={
          <form>
            <For each={modes}>{([value, langPackKey]) => (
              <Row>
                <Row.RadioField>
                  <RadioFieldTsx
                    class="disable-hover"
                    checked={chatReactions()?._ === value}
                    name={radioName}
                    value={value}
                    onChange={(checked) => checked && setMode(value)}
                  />
                </Row.RadioField>
                <Row.Title>{i18n(langPackKey)}</Row.Title>
              </Row>
            )}</For>
          </form>
        }>
          <Row>
            <Row.CheckboxFieldToggle>
              <CheckboxFieldTsx
                class="disable-hover"
                checked={chatReactions()?._ === 'chatReactionsSome'}
                toggle
                onChange={setBroadcastEnabled}
              />
            </Row.CheckboxFieldToggle>
            <Row.Title>{i18n('EnableReactions')}</Row.Title>
          </Row>
        </Show>
      </Section>
      <Section
        name="OnlyAllowThisReactions"
        classList={{hide: !isBroadcast() && chatReactions()?._ !== 'chatReactionsSome'}}
      >
        <For each={availableReactions()}>{(availableReaction) => (
          <Row havePadding>
            <Row.CheckboxFieldToggle>
              <CheckboxFieldTsx
                class="disable-hover"
                checked={emoticons().has(availableReaction.reaction)}
                toggle
                onChange={(checked) => setReactionChecked(availableReaction.reaction, checked)}
              />
            </Row.CheckboxFieldToggle>
            <Row.Title>{availableReaction.title}</Row.Title>
            <ReactionStickerPreview sticker={availableReaction.static_icon} />
          </Row>
        )}</For>
      </Section>
    </Show>
  );
};

export default ChatReactionsTab;
