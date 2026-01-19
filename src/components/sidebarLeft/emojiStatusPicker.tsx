import filterUnique from '@helpers/array/filterUnique';
import flatten from '@helpers/array/flatten';
import cloneDOMRect from '@helpers/dom/cloneDOMRect';
import {AccountEmojiStatuses, EmojiStatus} from '@layer';
import {AppManagers} from '@lib/managers';
import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import EmojiTab from '@components/emoticonsDropdown/tabs/emoji';
import Icon, {getIconContent} from '@components/icon';

export function openEmojiStatusPicker(options: {
  managers: AppManagers
  anchorElement: HTMLElement
  onChosen?: () => void
}) {
  const {managers, anchorElement} = options
  const emojiTab = new EmojiTab({
    noRegularEmoji: true,
    managers: managers,
    mainSets: () => {
      const defaultStatuses = managers.appStickersManager.getLocalStickerSet('inputStickerSetEmojiDefaultStatuses')
      .then((stickerSet) => {
        return stickerSet.documents.map((doc) => doc.id);
      });

      const convertEmojiStatuses = (emojiStatuses: AccountEmojiStatuses) => {
        return (emojiStatuses as AccountEmojiStatuses.accountEmojiStatuses)
        .statuses
        .map((status) => (status as EmojiStatus.emojiStatus).document_id)
        .filter(Boolean);
      };

      return [
        Promise.all([
          defaultStatuses,
          managers.appUsersManager.getRecentEmojiStatuses().then(convertEmojiStatuses),
          managers.appUsersManager.getDefaultEmojiStatuses().then(convertEmojiStatuses),
          managers.appEmojiManager.getRecentEmojis('custom')
        ]).then((arrays) => {
          return filterUnique(flatten(arrays));
        })
      ];
    },
    onClick: async(emoji) => {
      emoticonsDropdown.hideAndDestroy();

      const noStatus = getIconContent('star') === emoji.emoji;
      let emojiStatus: EmojiStatus;
      if(noStatus) {
        emojiStatus = {
          _: 'emojiStatusEmpty'
        };
      } else {
        emojiStatus = {
          _: 'emojiStatus',
          document_id: emoji.docId
        };

        options.onChosen?.()
      }

      managers.appUsersManager.updateEmojiStatus(emojiStatus);
    },
    canHaveEmojiTimer: true
  });

  const emoticonsDropdown = new EmoticonsDropdown({
    tabsToRender: [emojiTab],
    customParentElement: document.body,
    getOpenPosition: () => {
      const rect = anchorElement.getBoundingClientRect();
      const cloned = cloneDOMRect(rect);
      cloned.left = rect.left + rect.width / 2;
      cloned.top = rect.top + rect.height / 2;
      return cloned;
    }
  });

  const textColor = 'primary-color';

  emoticonsDropdown.setTextColor(textColor);

  emoticonsDropdown.addEventListener('closed', () => {
    emoticonsDropdown.hideAndDestroy();
  });

  emoticonsDropdown.onButtonClick();

  emojiTab.initPromise.then(() => {
    const emojiElement = Icon('star', 'super-emoji-premium-icon');
    emojiElement.style.color = `var(--${textColor})`;

    const category = emojiTab.getCustomCategory();

    emojiTab.addEmojiToCategory({
      category,
      element: emojiElement,
      batch: false,
      prepend: true
      // active: !iconEmojiId
    });

    // if(iconEmojiId) {
    //   emojiTab.setActive({docId: iconEmojiId, emoji: ''});
    // }
  });
}
