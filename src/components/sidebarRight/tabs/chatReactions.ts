/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import debounce from "../../../helpers/schedulers/debounce";
import CheckboxField from "../../checkboxField";
import Row from "../../row";
import { SettingSection } from "../../sidebarLeft";
import { SliderSuperTabEventable } from "../../sliderTab";
import { wrapStickerToRow } from "../../wrappers";

export default class AppChatReactionsTab extends SliderSuperTabEventable {
  public chatId: ChatId;

  protected async init() {
    this.setTitle('Reactions');

    const availableReactions = await this.managers.appReactionsManager.getActiveAvailableReactions();
    const chatFull = await this.managers.appProfileManager.getChatFull(this.chatId);
    let originalReactions = chatFull.available_reactions ?? [];
    const enabledReactions = new Set(originalReactions);

    const toggleSection = new SettingSection({
      caption: await this.managers.appChatsManager.isBroadcast(this.chatId) ? 'EnableReactionsChannelInfo' : 'EnableReactionsGroupInfo'
    });

    const toggleCheckboxField = new CheckboxField({toggle: true, checked: !!enabledReactions.size});
    const toggleRow = new Row({
      checkboxField: toggleCheckboxField,
      titleLangKey: 'EnableReactions',
      listenerSetter: this.listenerSetter
    });

    toggleSection.content.append(toggleRow.container);

    const reactionsSection = new SettingSection({
      name: 'AvailableReactions'
    });

    const checkboxFields = availableReactions.map((availableReaction) => {
      const checkboxField = new CheckboxField({
        toggle: true, 
        checked: enabledReactions.has(availableReaction.reaction)
      });

      this.listenerSetter.add(checkboxField.input)('change', () => {
        if(checkboxField.checked) {
          enabledReactions.add(availableReaction.reaction);

          if(!toggleCheckboxField.checked) {
            toggleCheckboxField.setValueSilently(true);
          }
        } else {
          enabledReactions.delete(availableReaction.reaction);

          if(!enabledReactions.size && toggleCheckboxField.checked) {
            toggleCheckboxField.setValueSilently(false);
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

    this.listenerSetter.add(toggleRow.checkboxField.input)('change', () => {
      if(!toggleCheckboxField.checked) {
        checkboxFields.forEach((checkboxField) => checkboxField.checked = false);
        saveReactionsDebounced();
      } else if(checkboxFields.every((checkboxField) => !checkboxField.checked)) {
        checkboxFields.forEach((checkboxField) => checkboxField.checked = true);
        saveReactionsDebounced();
      }
    });

    const saveReactions = async() => {
      const newReactions = Array.from(enabledReactions);
      if([...newReactions].sort().join() === [...originalReactions].sort().join()) {
        return;
      }

      const chatFull = await this.managers.appProfileManager.getCachedFullChat(this.chatId);
      if(chatFull) {
        chatFull.available_reactions = newReactions;
      }
      
      this.managers.appChatsManager.setChatAvailableReactions(this.chatId, newReactions);
      originalReactions = newReactions;
    };

    const saveReactionsDebounced = debounce(saveReactions, 3000, false, true);

    this.eventListener.addEventListener('destroy', saveReactions, {once: true});

    this.scrollable.append(toggleSection.container, reactionsSection.container);
  }
}
