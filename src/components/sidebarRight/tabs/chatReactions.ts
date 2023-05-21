/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import replaceContent from '../../../helpers/dom/replaceContent';
import debounce from '../../../helpers/schedulers/debounce';
import {ChatReactions, Reaction} from '../../../layer';
import {i18n, LangPackKey} from '../../../lib/langPack';
import rootScope from '../../../lib/rootScope';
import CheckboxField from '../../checkboxField';
import Row, {RadioFormFromValues} from '../../row';
import SettingSection from '../../settingSection';
import {SliderSuperTabEventable} from '../../sliderTab';
import wrapStickerToRow from '../../wrappers/stickerToRow';

export default class AppChatReactionsTab extends SliderSuperTabEventable {
  public chatId: ChatId;

  public static getInitArgs(chatId: ChatId) {
    return {
      availableReactions: rootScope.managers.appReactionsManager.getActiveAvailableReactions(),
      chatFull: rootScope.managers.appProfileManager.getChatFull(chatId)
    };
  }

  public async init({
    chatId,
    p = AppChatReactionsTab.getInitArgs(chatId)
  }: {
    chatId: ChatId,
    p?: ReturnType<typeof AppChatReactionsTab['getInitArgs']>
  }) {
    this.setTitle('Reactions');

    this.chatId = chatId;

    const [availableReactions, chatFull] = await Promise.all([p.availableReactions, p.chatFull]);
    const isBroadcast = await this.managers.appChatsManager.isBroadcast(this.chatId);

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

    const toggleSection = new SettingSection({
      name: isBroadcast ? undefined : 'AvailableReactions',
      caption: getCaptionLangPackKey()
    });

    const reactionsSection = new SettingSection({
      name: 'OnlyAllowThisReactions'
    });

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
        listenerSetter: this.listenerSetter
      });

      toggleSection.content.append(toggleRow.container);

      this.listenerSetter.add(toggleCheckboxField.input)('change', () => {
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
        reactionsSection.container.classList.toggle('hide', chatReactions._ !== 'chatReactionsSome');
      };

      let value = _chatReactions._;
      const form = RadioFormFromValues(a.map(([value, langPackKey]) => {
        return {
          langPackKey,
          value,
          checked: _chatReactions._ === value
        };
      }), (_value) => {
        value = _value as any;

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

        replaceContent(toggleSection.caption, i18n(getCaptionLangPackKey()));
        toggleCheckboxFieldsByEmoticons();
        saveReactionsDebounced();
        onChange();
      });

      toggleSection.content.append(form);
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

      this.listenerSetter.add(checkboxField.input)('change', () => {
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
        listenerSetter: this.listenerSetter
      });

      wrapStickerToRow({
        row,
        doc: availableReaction.static_icon,
        size: 'small'
      });

      reactionsSection.content.append(row.container);

      return checkboxField;
    });

    const saveReactions = async() => {
      saveReactionsDebounced.clearTimeout();
      // const newReactions = Array.from(enabledReactions);
      // if([...newReactions].sort().join() === [...originalReactions].sort().join()) {
      //   return;
      // }

      if(chatReactions._ === 'chatReactionsSome') {
        chatReactions.reactions = makeReactionFromEmoticons(Array.from(emoticons));
      }

      // const r = (chatReactions as ChatReactions.chatReactionsSome).reactions;
      // if(r?.length === availableReactions.length) {
      //   chatReactions = {_: 'chatReactionsAll'};
      // }

      this.managers.appChatsManager.setChatAvailableReactions(this.chatId, chatReactions);
      _chatReactions = chatReactions;
    };

    const saveReactionsDebounced = debounce(saveReactions, 3000, false, true);

    this.eventListener.addEventListener('destroy', () => {
      if(saveReactionsDebounced.isDebounced()) {
        saveReactions();
      }
    }, {once: true});

    this.scrollable.append(toggleSection.container, reactionsSection.container);
  }
}
