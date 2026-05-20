import {MessageEntity} from '@layer';
import getEmojiEntityFromEmoji from '@lib/richTextProcessor/getEmojiEntityFromEmoji';
import rootScope from '@lib/rootScope';
import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import EmojiTab from '@components/emoticonsDropdown/tabs/emoji';
import InputField, {insertRichTextAsHTML} from '@components/inputField';

import styles from '@components/emojiDropdownButton.module.scss';
import Button from '@components/buttonTsx';
import {createRoot, onCleanup} from 'solid-js';
import createListenerSetter from '@helpers/solid/createListenerSetter';

const createEmojiDropdownButton = ({
  inputField,
  class: _class,
  onEmoticonsDropdown,
  ...rest
}: {
  inputField: InputField,
  class: string,
  onEmoticonsDropdown?: (emoticonsDropdown: EmoticonsDropdown) => void
} & Pick<ConstructorParameters<typeof EmoticonsDropdown>[0], 'customParentElement' | 'getOpenPosition' | 'animationGroup'>) => createRoot((dispose) => {
  let button: HTMLButtonElement;
  Button.Icon({
    icon: 'smile',
    class: _class,
    noRipple: true,
    ref: (ref) => button = ref as HTMLButtonElement
  }) as HTMLElement;

  const emojiTab = new EmojiTab({
    managers: rootScope.managers,
    additionalStickerViewerClass: styles.StickerViewer,
    noPacks: !rootScope.premium,
    noSearchGroups: !rootScope.premium,
    onClick: async(emoji) => {
      const entity: MessageEntity = emoji.docId ? {
        _: 'messageEntityCustomEmoji',
        document_id: emoji.docId,
        length: emoji.emoji.length,
        offset: 0
      } : getEmojiEntityFromEmoji(emoji.emoji);

      insertRichTextAsHTML(
        inputField.input,
        emoji.emoji,
        entity ? [entity] : undefined
      );
    }
  });

  const emoticonsDropdown = new EmoticonsDropdown({
    tabsToRender: [emojiTab],
    ...rest
  });

  emoticonsDropdown.attachButtonListener(button, createListenerSetter());
  emoticonsDropdown.getElement().classList.add(styles.EmoticonsDropdown);
  emoticonsDropdown.setTextColor('primary-text-color');

  onEmoticonsDropdown?.(emoticonsDropdown);
  onCleanup(() => {
    emoticonsDropdown?.hideAndDestroy();
  });

  return {button, dispose};
});

export default createEmojiDropdownButton;
