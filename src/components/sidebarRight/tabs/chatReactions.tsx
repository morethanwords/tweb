import {Component, createSignal, onMount} from 'solid-js';
import debounce from '@helpers/schedulers/debounce';
import {ChatReactions, Reaction} from '@layer';
import {LangPackKey} from '@lib/langPack';
import CheckboxField from '@components/checkboxField';
import Row, {RadioFormFromValues} from '@components/row';
import Section from '@components/section';
import wrapStickerToRow from '@components/wrappers/stickerToRow';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppChatReactionsTab} from '@components/solidJsTabs/tabs';

const ChatReactionsTab: Component = () => {
  const [tab] = useSuperTab<typeof AppChatReactionsTab>();
  const promiseCollector = usePromiseCollector();
  const {chatId} = tab.payload;

  let toggleContent!: HTMLElement;
  let reactionsContent!: HTMLElement;
  const [toggleName, setToggleName] = createSignal<LangPackKey>();
  const [toggleCaption, setToggleCaption] = createSignal<LangPackKey>();
  const [reactionsHidden, setReactionsHidden] = createSignal(false);

  onMount(() => {
    promiseCollector.collect((async() => {
      const [availableReactions, chatFull] = await Promise.all([
        tab.managers.appReactionsManager.getActiveAvailableReactions(),
        tab.managers.appProfileManager.getChatFull(chatId)
      ]);
      const isBroadcast = await tab.managers.appChatsManager.isBroadcast(chatId);

      let _chatReactions = chatFull.available_reactions ?? {_: 'chatReactionsNone'};
      let chatReactions = _chatReactions;
      let emoticons = new Set(_chatReactions._ === 'chatReactionsSome' ? _chatReactions.reactions.map((reaction) => (reaction as Reaction.reactionEmoji).emoticon) : []);

      const makeReactionFromEmoticons = (emoticons: Array<string>): Reaction[] => emoticons.map((emoticon) => ({_: 'reactionEmoji', emoticon}));

      const getCaptionLangPackKey = (): LangPackKey => {
        if(isBroadcast) {
          return 'EnableReactionsChannelInfo';
        }

        return chatReactions._ === 'chatReactionsAll' ? 'EnableAllReactionsInfo' : (chatReactions._ === 'chatReactionsNone' ? 'DisableReactionsInfo' : 'EnableSomeReactionsInfo');
      };

      setToggleName(isBroadcast ? undefined : 'AvailableReactions');
      setToggleCaption(getCaptionLangPackKey());

      const toggleCheckboxFieldsByEmoticons = () => {
        const r: Reaction.reactionEmoji[] = (chatReactions as ChatReactions.chatReactionsSome).reactions as any ?? [];
        emoticons = new Set(r.map(({emoticon}) => emoticon));
        checkboxFieldsByEmoticon.forEach((checkboxField, emoticon) => {
          checkboxField.setValueSilently(emoticons.has(emoticon));
        });
      };

      let toggleCheckboxField: CheckboxField;
      if(isBroadcast) {
        toggleCheckboxField = new CheckboxField({toggle: true, checked: _chatReactions._ === 'chatReactionsSome'});
        const toggleRow = new Row({
          checkboxField: toggleCheckboxField,
          titleLangKey: 'EnableReactions',
          listenerSetter: tab.listenerSetter
        });

        toggleContent.append(toggleRow.container);

        tab.listenerSetter.add(toggleCheckboxField.input)('change', () => {
          let save = true;
          if(!toggleCheckboxField.checked) {
            chatReactions = {_: 'chatReactionsNone'};
          } else if(checkboxFields.every((checkboxField) => !checkboxField.checked)) {
            chatReactions = {_: 'chatReactionsSome', reactions: makeReactionFromEmoticons(availableReactions.map(({reaction}) => reaction))};
          } else if(chatReactions._ !== 'chatReactionsSome') {
            chatReactions = {_: 'chatReactionsSome', reactions: makeReactionFromEmoticons(Array.from(emoticons))};
          } else {
            save = false;
          }

          if(save) {
            toggleCheckboxFieldsByEmoticons();
            saveReactionsDebounced();
          }
        });
      } else {
        const a: [ChatReactions['_'], LangPackKey][] = [
          ['chatReactionsAll', 'AllReactions'],
          ['chatReactionsSome', 'SomeReactions'],
          ['chatReactionsNone', 'NoReactions']
        ];

        const onChange = () => {
          setReactionsHidden(chatReactions._ !== 'chatReactionsSome');
        };

        const form = RadioFormFromValues(a.map(([value, langPackKey]) => {
          return {
            langPackKey,
            value,
            checked: _chatReactions._ === value
          };
        }), (_value) => {
          const value = _value as any;

          if(value === 'chatReactionsAll') {
            chatReactions = {
              _: value,
              pFlags: {
                allow_custom: true
              }
            };
          } else if(value === 'chatReactionsNone') {
            chatReactions = {
              _: value
            };
          } else {
            chatReactions = {
              _: value,
              reactions: makeReactionFromEmoticons(['👍', '👎'])
            };
          }

          setToggleCaption(getCaptionLangPackKey());
          toggleCheckboxFieldsByEmoticons();
          saveReactionsDebounced();
          onChange();
        });

        toggleContent.append(form);
        onChange();
      }

      const checkboxFieldsByEmoticon: Map<string, CheckboxField> = new Map();
      const checkboxFields = availableReactions.map((availableReaction) => {
        const emoticon = availableReaction.reaction;
        const checkboxField = new CheckboxField({
          toggle: true,
          checked: emoticons.has(emoticon)
        });

        checkboxFieldsByEmoticon.set(emoticon, checkboxField);

        tab.listenerSetter.add(checkboxField.input)('change', () => {
          if(checkboxField.checked) {
            emoticons.add(emoticon);

            if(toggleCheckboxField && !toggleCheckboxField.checked) {
              toggleCheckboxField.checked = true;
            }
          } else {
            emoticons.delete(emoticon);

            if(toggleCheckboxField?.checked && !emoticons.size) {
              toggleCheckboxField.checked = false;
            }
          }

          saveReactionsDebounced();
        });

        const row = new Row({
          checkboxField,
          title: availableReaction.title,
          havePadding: true,
          listenerSetter: tab.listenerSetter
        });

        wrapStickerToRow({
          row,
          doc: availableReaction.static_icon,
          size: 'small'
        });

        reactionsContent.append(row.container);

        return checkboxField;
      });

      const saveReactions = async() => {
        saveReactionsDebounced.clearTimeout();

        if(chatReactions._ === 'chatReactionsSome') {
          chatReactions.reactions = makeReactionFromEmoticons(Array.from(emoticons));
          if(!chatReactions.reactions.length) {
            chatReactions = {_: 'chatReactionsNone'};
          }
        }

        tab.managers.appChatsManager.setChatAvailableReactions(chatId, chatReactions);
        _chatReactions = chatReactions;
      };

      const saveReactionsDebounced = debounce(saveReactions, 3000, false, true);

      tab.eventListener.addEventListener('destroy', () => {
        if(saveReactionsDebounced.isDebounced()) {
          saveReactions();
        }
      }, {once: true});
    })());
  });

  return (
    <>
      <Section
        name={toggleName()}
        caption={toggleCaption()}
        contentProps={{ref: (el) => toggleContent = el}}
      />
      <Section
        name="OnlyAllowThisReactions"
        classList={{hide: reactionsHidden()}}
        contentProps={{ref: (el) => reactionsContent = el}}
      />
    </>
  );
};

export default ChatReactionsTab;
