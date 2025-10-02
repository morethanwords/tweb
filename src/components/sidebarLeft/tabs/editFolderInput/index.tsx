import {onCleanup, onMount} from 'solid-js';
import {attachClickEvent} from '../../../../helpers/dom/clickEvent';
import cloneDOMRect from '../../../../helpers/dom/cloneDOMRect';
import {MessageEntity, TextWithEntities} from '../../../../layer';
import getEmojiEntityFromEmoji from '../../../../lib/richTextProcessor/getEmojiEntityFromEmoji';
import wrapEmojiText from '../../../../lib/richTextProcessor/wrapEmojiText';
import rootScope from '../../../../lib/rootScope';
import defineSolidElement, {PassedProps} from '../../../../lib/solidjs/defineSolidElement';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';
import ButtonIcon from '../../../buttonIcon';
import {EmoticonsDropdown} from '../../../emoticonsDropdown';
import InputField, {insertRichTextAsHTML} from '../../../inputField';
import {InputFieldTsx} from '../../../inputFieldTsx';
import styles from './styles.module.scss';

if(import.meta.hot) import.meta.hot.accept();


const MAX_FOLDER_NAME_LENGTH = 12;

type Props = {
  value?: TextWithEntities.textWithEntities;
  onInput: (value: string) => void;
};

type Controls = {
  inputField: InputField;
};


type CreateEmojiDropdownButtonArgs = {
  inputField: InputField;
};

const createEmojiDropdownButton = ({inputField}: CreateEmojiDropdownButtonArgs) => {
  const {EmojiTab, EmoticonsDropdown} = useHotReloadGuard();
  const button = ButtonIcon('smile ' + styles.EmojiButton);

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

        insertEmojiIntoField({inputField, text: emoji.emoji, entity});
      }
    });

    emoticonsDropdown = new EmoticonsDropdown({
      tabsToRender: [emojiTab],
      customParentElement: document.body,
      getOpenPosition: () => {
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
  });

  onCleanup(() => {
    emoticonsDropdown?.hideAndDestroy();
  });

  return button;
};

type InsertEmojiIntoFieldArgs = {
  inputField: InputField;
  text: string;
  entity?: MessageEntity;
};

const insertEmojiIntoField = ({inputField, text, entity}: InsertEmojiIntoFieldArgs) => {
  insertRichTextAsHTML(inputField.input, text, entity ? [entity] : undefined);
};

const EditFolderInput = defineSolidElement({
  name: 'edit-folder-input',
  component: (props: PassedProps<Props>, _, controls: Controls) => {
    onMount(() => {
      controls.inputField?.input.after(createEmojiDropdownButton({inputField: controls.inputField}));
    });

    return (
      <>
        <InputFieldTsx
          instanceRef={(value) => void (controls.inputField = value)}
          label='FilterNameHint'
          maxLength={MAX_FOLDER_NAME_LENGTH}
          value={props.value ? wrapEmojiText(props.value.text, true, props.value.entities) : ''}
          onRawInput={props.onInput}
          canWrapCustomEmojis
        />
      </>
    );
  }
});

export default EditFolderInput;
