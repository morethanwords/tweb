/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import toggleDisability from '../../../helpers/dom/toggleDisability';
import {makeMediaSize} from '../../../helpers/mediaSize';
import copy from '../../../helpers/object/copy';
import deepEqual from '../../../helpers/object/deepEqual';
import {ForumTopic} from '../../../layer';
import appImManager from '../../../lib/appManagers/appImManager';
import {GENERAL_TOPIC_ID, TOPIC_COLORS} from '../../../lib/mtproto/mtproto_config';
import getAbbreviation from '../../../lib/richTextProcessor/getAbbreviation';
import ButtonIcon from '../../buttonIcon';
import CheckboxField from '../../checkboxField';
import EmojiTab from '../../emoticonsDropdown/tabs/emoji';
import InputField from '../../inputField';
import Row from '../../row';
import SettingSection from '../../settingSection';
import appSidebarLeft from '../../sidebarLeft';
import SliderSuperTab from '../../sliderTab';
import {wrapTopicIcon} from '../../wrappers/messageActionTextNewUnsafe';

const size = 64;
const mediaSize = makeMediaSize(size, size);

export default class AppEditTopicTab extends SliderSuperTab {
  private iconDiv: HTMLElement;
  private colorIndex: number;
  private nameInputField: InputField;
  private topic: Parameters<typeof wrapTopicIcon>[0]['topic'];
  private emojiElement: HTMLElement;
  private confirmBtn: HTMLButtonElement;
  private originalTopic: ForumTopic.forumTopic;

  public async init(peerId: PeerId, threadId?: number) {
    this.colorIndex = 0;
    const isNew = !threadId;
    const isGeneral = threadId === GENERAL_TOPIC_ID;
    this.container.classList.add('edit-topic-container');
    this.setTitle(isNew ? 'NewTopic' : 'ForumTopic.Title.Edit');
    const chatId = peerId.toChatId();

    if(threadId) {
      this.topic = this.originalTopic = copy(await this.managers.dialogsStorage.getForumTopic(peerId, threadId));
    }

    {
      const section = new SettingSection({
        name: isGeneral ? 'CreateGeneralTopicTitle' : 'CreateTopicTitle'
      });

      const iconDiv = this.iconDiv = document.createElement('div');
      iconDiv.classList.add('edit-topic-icon-container');

      !threadId && attachClickEvent(iconDiv, () => {
        if(this.topic.icon_emoji_id) {
          return;
        }

        this.colorIndex = (this.colorIndex + 1) % TOPIC_COLORS.length;
        this.setIcon();
      }, {listenerSetter: this.listenerSetter});

      if(threadId) {
        iconDiv.classList.add('disable-hover');
      }

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      const nameInputField = this.nameInputField = new InputField({
        label: 'ForumTopic.Name.Placeholder',
        withLinebreaks: false,
        name: 'topic-name',
        maxLength: 70,
        required: true
      });

      if(this.topic) {
        nameInputField.setOriginalValue(this.topic.title, true);
      }

      const confirmBtn = this.confirmBtn = ButtonIcon('check btn-confirm blue hide', {noRipple: true});
      this.header.append(confirmBtn);

      attachClickEvent(confirmBtn, () => {
        const toggle = toggleDisability([confirmBtn], true);
        if(threadId) {
          this.managers.appChatsManager.editForumTopic({
            chatId,
            topicId: threadId,
            title: nameInputField.value,
            iconEmojiId: this.topic.icon_emoji_id || 0
          }).then(() => {
            this.close();
          }).catch((err) => {
            console.error('edit topic error', err);
            toggle();
          });
        } else {
          this.managers.appChatsManager.createForumTopic({
            chatId,
            iconColor: TOPIC_COLORS[this.colorIndex],
            iconEmojiId: this.topic.icon_emoji_id,
            title: nameInputField.value
          }).then((threadId) => {
            this.close();
            appImManager.setInnerPeer({
              peerId,
              threadId
            });
          }).catch((err) => {
            console.error('create topic error', err);
            toggle();
          });
        }
      }, {listenerSetter: this.listenerSetter});

      this.listenerSetter.add(nameInputField.input)('input', () => {
        this.validate();
        this.setIcon(this.topic?.icon_emoji_id);
      });

      inputWrapper.append(nameInputField.container);

      section.content.append(iconDiv, inputWrapper);

      this.scrollable.append(section.container);
    }

    const promises: Promise<any>[] = [];

    if(!isGeneral) {
      const section = new SettingSection({});
      section.container.classList.add('edit-topic-emoticons-container');
      const emojiTab = new EmojiTab({
        managers: this.managers,
        isStandalone: true,
        noRegularEmoji: true,
        mainSets: () => {
          return this.managers.appStickersManager.getLocalStickerSet('inputStickerSetEmojiDefaultTopicIcons')
          .then((messagesStickerSet) => messagesStickerSet.documents.map((doc) => doc.id));
        },
        onClick: (emoji) => {
          emojiTab.setActive(!emoji.docId ? {emoji: undefined, docId: undefined} : emoji);
          this.setIcon(emoji.docId);
        }
      });
      emojiTab.getContainerSize = () => ({
        width: appSidebarLeft.rect.width,
        height: 400
      });

      this.middlewareHelper.onDestroy(() => {
        emojiTab.destroy();
      });

      emojiTab.container.classList.remove('tabs-tab');

      this.emojiElement = document.createElement('span');
      this.emojiElement.classList.add('super-emoji-topic-icon');

      const promise = emojiTab.init().then(async() => {
        const category = emojiTab.getCustomCategory();

        const iconEmojiId = this.topic?.icon_emoji_id;
        emojiTab.addEmojiToCategory({
          category,
          element: this.emojiElement,
          batch: false,
          prepend: true,
          active: !iconEmojiId
        });

        if(iconEmojiId) {
          emojiTab.setActive({docId: iconEmojiId, emoji: ''});
        }
      });

      promises.push(promise);

      section.content.replaceWith(emojiTab.container);
      this.scrollable.append(section.container);
    } else {
      const section = new SettingSection({caption: 'EditTopicHideInfo'});

      const checkboxField = new CheckboxField({
        // toggle: true,
        checked: !(this.topic as ForumTopic.forumTopic).pFlags.hidden,
        text: 'EditTopicHide'
      });

      this.listenerSetter.add(checkboxField.input)('change', () => {
        const promise = this.managers.appChatsManager.editForumTopic({
          chatId,
          topicId: threadId,
          hidden: !checkboxField.checked
        });

        row.disableWithPromise(promise);
      });

      const row = new Row({
        checkboxField
      });

      section.content.append(row.container);

      this.scrollable.append(section.container);
    }

    return Promise.all(promises).then(() => {
      return this.s();
    });
  }

  private validate() {
    let isChanged = this.nameInputField.isValidToChange();
    if(!isChanged && this.originalTopic) {
      isChanged = this.topic.icon_emoji_id !== this.originalTopic.icon_emoji_id;
    }

    this.confirmBtn.classList.toggle('hide', !isChanged);
  }

  private s() {
    if(this.topic?.icon_color) {
      this.colorIndex = TOPIC_COLORS.indexOf(this.topic.icon_color);
    }

    return this.setIcon(this.topic?.icon_emoji_id, undefined, true);
  }

  private async setIcon(iconEmojiId?: Long, appendTo = this.iconDiv, force?: boolean) {
    const title = this.nameInputField.value;

    const isMainIcon = appendTo === this.iconDiv;

    if(isMainIcon) {
      const newTopic: AppEditTopicTab['topic'] = {
        id: this.topic?.id,
        icon_color: TOPIC_COLORS[this.colorIndex],
        title: getAbbreviation(title, true).text || 'A',
        icon_emoji_id: iconEmojiId
      };

      const oldTopic = this.topic;
      this.topic = newTopic;

      if(
        force ||
        !oldTopic ||
        oldTopic.icon_color !== newTopic.icon_color ||
        oldTopic.title !== newTopic.title
      ) {
        this.setIcon(undefined, this.emojiElement);
      }

      if(deepEqual(oldTopic, newTopic) && !force) {
        return;
      }

      this.validate();
    }

    const el = await wrapTopicIcon({
      topic: isMainIcon ? this.topic : {...this.topic, icon_emoji_id: undefined},
      customEmojiSize: mediaSize,
      middleware: this.middlewareHelper.get()
    });

    const span = document.createElement('div');
    span.classList.add('edit-topic-icon');
    span.append(el);

    const oldEl = appendTo.lastElementChild as HTMLElement;
    appendTo.append(span);

    const applyFadeAnimation = (el: HTMLElement, fadeIn: boolean) => {
      const frames: Keyframe[] = [
        {opacity: '0', transform: 'scale(0.8)'},
        {opacity: '1', transform: 'scale(1)'}
      ];

      const animation = el.animate(frames, {
        duration: 200,
        iterations: 1,
        easing: 'ease-in-out',
        fill: 'forwards',
        direction: fadeIn ? 'normal' : 'reverse'
      });

      return new Promise<void>((resolve) => {
        animation.addEventListener('finish', () => {
          resolve();
        }, {once: true});
      });
    };

    if(oldEl) {
      applyFadeAnimation(oldEl, false).then(() => oldEl.remove());
    }

    applyFadeAnimation(span, true);
  }
}
