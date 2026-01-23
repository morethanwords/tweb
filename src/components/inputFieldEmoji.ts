import {attachClickEvent} from '@helpers/dom/clickEvent';
import cloneDOMRect from '@helpers/dom/cloneDOMRect';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import deepEqual from '@helpers/object/deepEqual';
import {MessageEntity, TextWithEntities} from '@layer';
import getEmojiEntityFromEmoji from '@lib/richTextProcessor/getEmojiEntityFromEmoji';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import rootScope from '@lib/rootScope';
import ButtonIcon from '@components/buttonIcon';
import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import EmojiTab from '@components/emoticonsDropdown/tabs/emoji';
import InputField, {InputFieldOptions, insertRichTextAsHTML} from '@components/inputField';

import styles from '@components/inputFieldEmoji.module.scss';

const createEmojiDropdownButton = ({
  inputField,
  onEmoticonsDropdown
}: {
  inputField: InputFieldEmoji,
  onEmoticonsDropdown: (emoticonsDropdown: EmoticonsDropdown) => void
}) => {
  const button = ButtonIcon('smile ' + styles.EmojiButton);
  if(inputField.options.withLinebreaks) {
    button.classList.add(styles.multiline);
  }

  let emoticonsDropdown: EmoticonsDropdown;

  attachClickEvent(button, async() => {
    if(emoticonsDropdown) return;

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

        insertRichTextAsHTML(inputField.input, emoji.emoji, entity ? [entity] : undefined);
      }
    });

    emoticonsDropdown = new EmoticonsDropdown({
      tabsToRender: [emojiTab],
      customParentElement: document.body,
      getOpenPosition: () => {
        if(inputField.options.withLinebreaks) {
          const rect = inputField.input.getBoundingClientRect()
          const cloned = cloneDOMRect(rect);
          cloned.top += rect.height
          if(cloned.top + 420 > window.innerHeight) {
            cloned.top = rect.top - 428
          }

          cloned.left += rect.width / 2
          return cloned
        }

        const rect = button.getBoundingClientRect();
        const cloned = cloneDOMRect(rect);
        cloned.left = rect.left + rect.width / 2;
        cloned.top = rect.top + rect.height / 2;
        return cloned;
      }
    });

    emoticonsDropdown.getElement()?.classList.add(styles.EmoticonsDropdown);

    const textColor = 'primary-text-color';

    emoticonsDropdown.setTextColor(textColor);

    emoticonsDropdown.addEventListener('closed', () => {
      emoticonsDropdown.hideAndDestroy();
      emoticonsDropdown = undefined;
    });

    emoticonsDropdown.onButtonClick();

    onEmoticonsDropdown(emoticonsDropdown);
  });

  return {button};
};

export class InputFieldEmoji extends InputField {
  private emoticonsDropdown: EmoticonsDropdown;
  private richOriginalValue: TextWithEntities;

  constructor(options?: InputFieldOptions) {
    super({
      canWrapCustomEmojis: true,
      ...options
    })

    const {button} = createEmojiDropdownButton({
      inputField: this,
      onEmoticonsDropdown: (emoticonsDropdown) => {
        this.emoticonsDropdown = emoticonsDropdown;
      }
    });
    this.input.after(button);
  }

  public cleanup() {
    this.emoticonsDropdown?.hideAndDestroy();
  }

  get richValue(): TextWithEntities {
    const {value, entities} = getRichValueWithCaret(this.input);
    return {_: 'textWithEntities', text: value, entities};
  }
  set richValue(value: TextWithEntities) {
    this.value = wrapEmojiText(value.text, false, value.entities);
  }

  public setRichOriginalValue(value: TextWithEntities) {
    this.richOriginalValue = value;
    this.value = wrapEmojiText(value.text, true, value.entities);
  }

  isChanged() {
    return !deepEqual(this.richValue, this.richOriginalValue);
  }
}
