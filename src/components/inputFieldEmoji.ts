import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import deepEqual from '@helpers/object/deepEqual';
import {TextWithEntities} from '@layer';
import InputField, {InputFieldOptions} from '@components/inputField';
import attachPlainMessageEditor from '@components/chat/inputEditor/plainField';
import type {ChatInputEditor} from '@components/chat/inputEditor/types';
import createEmojiDropdownButton from '@components/emojiDropdownButton';
import classNames from '@helpers/string/classNames';
import styles from '@components/inputFieldEmoji.module.scss';
import cloneDOMRect from '@helpers/dom/cloneDOMRect';
import {getAppWindow, getOverlayRoot} from '@helpers/appWindow';

export class InputFieldEmoji extends InputField {
  private richOriginalValue: TextWithEntities;
  private dispose: () => void;
  private editor: ChatInputEditor;

  constructor(options?: InputFieldOptions) {
    super({
      canWrapCustomEmojis: true,
      ...options
    })

    // Every field of this class sends text plus entities, so it gets the
    // composer's engine: the clipboard, undo and custom emoji then behave as in
    // the chat input, and a one-line field gets the one-line schema.
    this.editor = attachPlainMessageEditor(this.input);

    const {button, dispose} = createEmojiDropdownButton({
      inputField: this,
      class: classNames(
        styles.EmojiButton,
        this.options.withLinebreaks && styles.multiline
      ),
      customParentElement: getOverlayRoot,
      getOpenPosition: () => {
        if(this.options.withLinebreaks) {
          const rect = this.input.getBoundingClientRect();
          const cloned = cloneDOMRect(rect);
          cloned.top += rect.height;
          if(cloned.top + 420 > getAppWindow().innerHeight) {
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
    this.editor.destroy();
    this.dispose();
  }

  get richValue(): TextWithEntities {
    const {value, entities} = getRichValueWithCaret(this.input);
    return {_: 'textWithEntities', text: value, entities};
  }
  set richValue(value: TextWithEntities) {
    this.value = value;
  }

  public setRichOriginalValue(value: TextWithEntities) {
    this.richOriginalValue = value;
    this.value = value;
  }

  isChanged() {
    return !deepEqual(this.richValue, this.richOriginalValue);
  }
}
