import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import deepEqual from '@helpers/object/deepEqual';
import {TextWithEntities} from '@layer';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import InputField, {InputFieldOptions} from '@components/inputField';
import createEmojiDropdownButton from '@components/emojiDropdownButton';
import classNames from '@helpers/string/classNames';
import styles from '@components/inputFieldEmoji.module.scss';
import cloneDOMRect from '@helpers/dom/cloneDOMRect';

export class InputFieldEmoji extends InputField {
  private richOriginalValue: TextWithEntities;
  private dispose: () => void;

  constructor(options?: InputFieldOptions) {
    super({
      canWrapCustomEmojis: true,
      ...options
    })

    const {button, dispose} = createEmojiDropdownButton({
      inputField: this,
      class: classNames(
        styles.EmojiButton,
        this.options.withLinebreaks && styles.multiline
      ),
      customParentElement: document.body,
      getOpenPosition: () => {
        if(this.options.withLinebreaks) {
          const rect = this.input.getBoundingClientRect();
          const cloned = cloneDOMRect(rect);
          cloned.top += rect.height;
          if(cloned.top + 420 > window.innerHeight) {
            cloned.top = rect.top - 428;
          }

          cloned.left += rect.width / 2;
          return cloned;
        }

        const rect = button.getBoundingClientRect();
        const cloned = cloneDOMRect(rect);
        cloned.left = rect.left + rect.width / 2;
        cloned.top = rect.top + rect.height / 2;
        return cloned;
      }
    });
    this.dispose = dispose;
    this.input.after(button);
  }

  public cleanup() {
    this.dispose();
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
