import {Component} from 'solid-js';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import toggleDisability from '@helpers/dom/toggleDisability';
import {makeMediaSize} from '@helpers/mediaSize';
import copy from '@helpers/object/copy';
import deepEqual from '@helpers/object/deepEqual';
import {ForumTopic} from '@layer';
import {GENERAL_TOPIC_ID, TOPIC_COLORS} from '@appManagers/constants';
import getAbbreviation from '@lib/richTextProcessor/getAbbreviation';
import {i18n} from '@lib/langPack';
import ButtonIcon from '@components/buttonIcon';
import CheckboxField from '@components/checkboxField';
import EmojiTab from '@components/emoticonsDropdown/tabs/emoji';
import InputField from '@components/inputField';
import Row from '@components/row';
import SettingSection from '@components/settingSection';
import {wrapTopicIcon} from '@components/wrappers/messageActionTextNewUnsafe';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppEditTopicTab} from '@components/solidJsTabs/tabs';

const size = 64;
const mediaSize = makeMediaSize(size, size);

type Topic = Parameters<typeof wrapTopicIcon>[0]['topic'];

const EditTopic: Component = () => {
  const [tab] = useSuperTab<typeof AppEditTopicTab>();
  const promiseCollector = usePromiseCollector();
  const {appImManager, appSidebarLeft} = useHotReloadGuard();
  const {peerId, threadId} = tab.payload;

  let colorIndex = 0;
  let topic: Topic;
  let originalTopic: ForumTopic.forumTopic;
  let iconDiv: HTMLElement;
  let emojiElement: HTMLElement;
  let confirmBtn: HTMLButtonElement;
  let nameInputField: InputField;

  const validate = () => {
    let isChanged = nameInputField.isValidToChange();
    if(!isChanged && originalTopic) {
      isChanged = topic.icon_emoji_id !== originalTopic.icon_emoji_id;
    }

    confirmBtn.classList.toggle('hide', !isChanged);
  };

  const s = () => {
    if(topic?.icon_color) {
      colorIndex = TOPIC_COLORS.indexOf(topic.icon_color);
    }

    return setIcon(topic?.icon_emoji_id, undefined, true);
  };

  const setIcon = async(iconEmojiId?: Long, appendTo = iconDiv, force?: boolean) => {
    const title = nameInputField.value;

    const isMainIcon = appendTo === iconDiv;

    if(isMainIcon) {
      const newTopic: Topic = {
        id: topic?.id,
        icon_color: TOPIC_COLORS[colorIndex],
        title: getAbbreviation(title, true).text || 'A',
        icon_emoji_id: iconEmojiId
      };

      const oldTopic = topic;
      topic = newTopic;

      if(
        force ||
        !oldTopic ||
        oldTopic.icon_color !== newTopic.icon_color ||
        oldTopic.title !== newTopic.title
      ) {
        setIcon(undefined, emojiElement);
      }

      if(deepEqual(oldTopic, newTopic) && !force) {
        return;
      }

      validate();
    }

    const el = await wrapTopicIcon({
      topic: isMainIcon ? topic : {...topic, icon_emoji_id: undefined},
      customEmojiSize: mediaSize,
      middleware: tab.middlewareHelper.get()
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
  };

  promiseCollector.collect((async() => {
    colorIndex = 0;
    const isNew = !threadId;
    const isGeneral = threadId === GENERAL_TOPIC_ID;
    tab.container.classList.add('edit-topic-container');
    tab.title.replaceChildren(i18n(isNew ? 'NewTopic' : 'ForumTopic.Title.Edit'));

    if(threadId) {
      topic = originalTopic = copy(await tab.managers.dialogsStorage.getForumTopic(peerId, threadId));
    }

    {
      const section = new SettingSection({
        name: isGeneral ? 'CreateGeneralTopicTitle' : 'CreateTopicTitle'
      });

      iconDiv = document.createElement('div');
      iconDiv.classList.add('edit-topic-icon-container');

      !threadId && attachClickEvent(iconDiv, () => {
        if(topic.icon_emoji_id) {
          return;
        }

        colorIndex = (colorIndex + 1) % TOPIC_COLORS.length;
        setIcon();
      }, {listenerSetter: tab.listenerSetter});

      if(threadId) {
        iconDiv.classList.add('disable-hover');
      }

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      nameInputField = new InputField({
        label: 'ForumTopic.Name.Placeholder',
        withLinebreaks: false,
        name: 'topic-name',
        maxLength: 70,
        required: true
      });

      if(topic) {
        nameInputField.setOriginalValue(topic.title, true);
      }

      confirmBtn = ButtonIcon('check btn-confirm blue hide', {noRipple: true});
      tab.header.append(confirmBtn);

      attachClickEvent(confirmBtn, () => {
        const toggle = toggleDisability([confirmBtn], true);
        if(threadId) {
          tab.managers.appMessagesManager.editForumTopic({
            peerId,
            topicId: threadId,
            title: nameInputField.value,
            iconEmojiId: topic.icon_emoji_id || 0
          }).then(() => {
            tab.close();
          }).catch((err) => {
            console.error('edit topic error', err);
            toggle();
          });
        } else {
          tab.managers.appMessagesManager.createForumTopic({
            peerId,
            iconColor: TOPIC_COLORS[colorIndex],
            iconEmojiId: topic.icon_emoji_id,
            title: nameInputField.value
          }).then((threadId) => {
            tab.close();
            appImManager.setInnerPeer({
              peerId,
              threadId
            });
          }).catch((err) => {
            console.error('create topic error', err);
            toggle();
          });
        }
      }, {listenerSetter: tab.listenerSetter});

      tab.listenerSetter.add(nameInputField.input)('input', () => {
        validate();
        setIcon(topic?.icon_emoji_id);
      });

      inputWrapper.append(nameInputField.container);

      section.content.append(iconDiv, inputWrapper);

      tab.scrollable.append(section.container);
    }

    const promises: Promise<any>[] = [];

    if(!isGeneral) {
      const section = new SettingSection({});
      section.container.classList.add('edit-topic-emoticons-container');
      const emojiTab = new EmojiTab({
        managers: tab.managers,
        isStandalone: true,
        noRegularEmoji: true,
        mainSets: () => {
          return tab.managers.appStickersManager.getLocalStickerSet('inputStickerSetEmojiDefaultTopicIcons')
          .then((messagesStickerSet) => messagesStickerSet.documents.map((doc) => doc.id));
        },
        onClick: (emoji) => {
          emojiTab.setActive(!emoji.docId ? {emoji: undefined, docId: undefined} : emoji);
          setIcon(emoji.docId);
        }
      });
      emojiTab.getContainerSize = () => ({
        width: appSidebarLeft.rect.width,
        height: 400
      });

      tab.middlewareHelper.onDestroy(() => {
        emojiTab.destroy();
      });

      emojiTab.container.classList.remove('tabs-tab');

      emojiElement = document.createElement('span');
      emojiElement.classList.add('super-emoji-topic-icon');

      const promise = emojiTab.init().then(async() => {
        const category = emojiTab.getCustomCategory();

        const iconEmojiId = topic?.icon_emoji_id;
        emojiTab.addEmojiToCategory({
          category,
          element: emojiElement,
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
      tab.scrollable.append(section.container);
    } else {
      const section = new SettingSection({caption: 'EditTopicHideInfo'});

      const checkboxField = new CheckboxField({
        checked: !(topic as ForumTopic.forumTopic).pFlags.hidden,
        text: 'EditTopicHide'
      });

      tab.listenerSetter.add(checkboxField.input)('change', () => {
        const promise = tab.managers.appMessagesManager.editForumTopic({
          peerId,
          topicId: threadId,
          hidden: !checkboxField.checked
        });

        row.disableWithPromise(promise);
      });

      const row = new Row({
        checkboxField
      });

      section.content.append(row.container);

      tab.scrollable.append(section.container);
    }

    await Promise.all(promises);
    await s();
  })());

  return null;
};

export default EditTopic;
