import Button from '@components/buttonTsx';
import styles from '@components/emojiDropdownButton.module.scss';
import {EmoticonsDropdown} from '@components/emoticonsDropdown';
import EmojiTab from '@components/emoticonsDropdown/tabs/emoji';
import InputField, {insertRichTextAsHTML} from '@components/inputField';
import createListenerSetter from '@helpers/solid/createListenerSetter';
import {MessageEntity} from '@layer';
import {getMessageEntityForEmojiWithDocId} from '@lib/richTextProcessor/getMessageEntityFromDocIdOrEmoji';
import rootScope from '@lib/rootScope';
import {createRoot, onCleanup} from 'solid-js';


type CreateEmojiDropdownButtonArgs = {
  inputField?: InputField;
  class?: string;
  onEmoticonsDropdown?: (emoticonsDropdown: EmoticonsDropdown) => void;
  onClick?: OnClick;
}
  & Pick<ConstructorParameters<typeof EmoticonsDropdown>[0], 'customParentElement' | 'getOpenPosition' | 'animationGroup'>
  & Pick<ConstructorParameters<typeof EmojiTab>[0], 'noPacks' | 'noSearchGroups' | 'noRegularEmoji' | 'canUsePremiumEmojiAlways'>;

type OnClick = ConstructorParameters<typeof EmojiTab>[0]['onClick'];

const createEmojiDropdownButton = ({
  class: _class,
  onEmoticonsDropdown,
  ...rest
}: CreateEmojiDropdownButtonArgs) => createRoot((dispose) => {
  let button: HTMLButtonElement;
  Button.Icon({
    icon: 'smile',
    class: _class,
    noRipple: true,
    ref: (ref) => button = ref as HTMLButtonElement
  }) as HTMLElement;

  const {emoticonsDropdown} = useEmojiDropdown({
    element: button,
    ...rest
  });

  onEmoticonsDropdown?.(emoticonsDropdown);

  return {button, dispose};
});

type UseEmojiDropdownArgs = Omit<CreateEmojiDropdownButtonArgs, 'class' | 'onEmoticonsDropdown'> & {
  element: HTMLElement;
};

export const useEmojiDropdown = ({
  inputField,
  onClick = inputField ? getDefaultOnClick(inputField) : undefined,
  element,
  noPacks,
  noSearchGroups,
  noRegularEmoji,
  canUsePremiumEmojiAlways,
  ...rest
}: UseEmojiDropdownArgs) => {
  const emojiTab = new EmojiTab({
    managers: rootScope.managers,
    additionalStickerViewerClass: styles.StickerViewer,
    noPacks: noPacks ?? !rootScope.premium,
    noSearchGroups: noSearchGroups ?? !rootScope.premium,
    noRegularEmoji,
    onClick: onClick,
    canUsePremiumEmojiAlways
  });

  const emoticonsDropdown = new EmoticonsDropdown({
    tabsToRender: [emojiTab],
    ...rest
  });

  emoticonsDropdown.attachButtonListener(element, createListenerSetter());
  emoticonsDropdown.getElement().classList.add(styles.EmoticonsDropdown);
  emoticonsDropdown.setTextColor('primary-text-color');

  onCleanup(() => {
    emoticonsDropdown?.hideAndDestroy();
  });

  return {
    emojiTab,
    emoticonsDropdown
  };
};

const getDefaultOnClick = (inputField: InputField): OnClick => (emoji) => {
  const entity: MessageEntity = getMessageEntityForEmojiWithDocId({
    docId: emoji.docId,
    emoji: emoji.emoji
  });

  insertRichTextAsHTML(
    inputField.input,
    emoji.emoji,
    entity ? [entity] : undefined
  );
};

export default createEmojiDropdownButton;
