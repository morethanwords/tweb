import {onCleanup} from 'solid-js';
import {TextWithEntities} from '@layer';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import defineSolidElement, {PassedProps} from '@lib/solidjs/defineSolidElement';
import {InputFieldEmoji} from '@components/inputFieldEmoji';
import {InputFieldTsx} from '@components/inputFieldTsx';

if(import.meta.hot) import.meta.hot.accept();


const MAX_FOLDER_NAME_LENGTH = 12;

type Props = {
  value?: TextWithEntities.textWithEntities;
  onInput: (value: string) => void;
};

type Controls = {
  inputField: InputFieldEmoji;
};

const EditFolderInput = defineSolidElement({
  name: 'edit-folder-input',
  component: (props: PassedProps<Props>, _, controls: Controls) => {
    onCleanup(() => {
      controls.inputField.cleanup();
    });

    return (
      <>
        <InputFieldTsx
          InputFieldClass={InputFieldEmoji}
          instanceRef={(value) => void (controls.inputField = value)}
          label='FilterNameHint'
          maxLength={MAX_FOLDER_NAME_LENGTH}
          value={props.value ? wrapEmojiText(props.value.text, true, props.value.entities) : ''}
          onRawInput={props.onInput}
        />
      </>
    );
  }
});

export default EditFolderInput;
