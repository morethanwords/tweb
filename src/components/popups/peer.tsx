import PopupElement, {addCancelButton, createPopup, PopupButton, PopupOptions} from '@components/popups/indexTsx';
import {i18n, LangPackKey} from '@lib/langPack';
import CheckboxField, {CheckboxFieldOptions} from '@components/checkboxField';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {AvatarNewTsx} from '@components/avatarNew';
import rootScope from '@lib/rootScope';
import InputField from '@components/inputField';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import RowTsx from '@components/rowTsx';
import {createSignal, For, JSX, onMount, Show} from 'solid-js';
import {subscribeOn} from '@helpers/solid/subscribeOn';

export type PopupPeerButtonCallbackCheckboxes = Set<LangPackKey>;
export type PopupPeerButtonCallback = (e: MouseEvent, checkboxes?: PopupPeerButtonCallbackCheckboxes) => void;
export type PopupPeerButton = Omit<PopupButton, 'callback'> & Partial<{
  callback: PopupPeerButtonCallback,
  onlyWithCheckbox: PopupPeerCheckboxOptions
}>;
// the caption belongs to the row the popup builds around the checkbox, not to the checkbox itself;
// `text` doubles as the checkbox's identity in the button callbacks
export type PopupPeerCheckboxOptions = CheckboxFieldOptions & {
  text?: LangPackKey,
  textArgs?: any[],
  checkboxField?: CheckboxField
};

export type PopupPeerOptions = PopupOptions & Partial<{
  peerId: PeerId,
  threadId: number,
  // for a peer the plain avatar can't draw on its own (a Community and its decoration);
  // the caller owns it and its teardown
  avatar: HTMLElement,
  title: string | HTMLElement | DocumentFragment,
  titleLangKey: LangPackKey,
  titleLangArgs: any[],
  noTitle: boolean,
  /** For a popup that draws its own head inside the body (the chat-invite card). */
  noHeader: boolean,
  /** Wrap the content in `.popup-body` — a flex column the popup's own styles can lay out. */
  body: boolean,
  description: Parameters<typeof setInnerHTML>[1] | true,
  descriptionRaw: string,
  descriptionLangKey: LangPackKey,
  descriptionLangArgs: any[],
  buttons: Array<PopupPeerButton>,
  checkboxes: Array<PopupPeerCheckboxOptions>,
  inputField: InputField,
  /** Anything the confirmation itself is about — a radio list, a preview — under the description. */
  content: JSX.Element,
  /** The same, above the description — a limit bar the copy then explains. */
  contentBefore: JSX.Element,
  /** Hold the popup back until the caller's own content is ready (see the handle's `show`). */
  deferShow: boolean,
  /** For copy long enough to need it (an ad's small print, say). */
  scrollable: boolean
}>;

/** This popup's line of copy. It belongs to the confirmation shell — anything else states its own. */
function Description(props: {options: PopupPeerOptions}) {
  const {options} = props;
  const p = document.createElement('p');
  p.classList.add('popup-description');
  if(options.descriptionLangKey) p.append(i18n(options.descriptionLangKey, options.descriptionLangArgs));
  // `setInnerHTML` also marks the direction, which the raw text relies on
  else if(options.description && options.description !== true) setInnerHTML(p, options.description);
  else if(options.descriptionRaw) p.append(wrapEmojiText(options.descriptionRaw));
  return p;
}

/** All a caller outside the popup needs: a way to take it away (a poll that got sent, say). */
export type PopupPeerHandle = {show: () => void, hide: () => void};

export default function showPeerPopup(className: string, options: PopupPeerOptions = {}): PopupPeerHandle {
  const buttons = options.buttons && addCancelButton(options.buttons as PopupButton[]) as PopupPeerButton[];
  const {checkboxes, inputField} = options;
  const hasDescription = !!(options.descriptionLangKey || options.description || options.descriptionRaw);
  const [show, setShow] = createSignal(!options.deferShow);

  createPopup(() => {
    // read at click time, exactly like the checkbox rows are read
    const checkedSet = () => {
      const set: PopupPeerButtonCallbackCheckboxes = new Set();
      checkboxes?.forEach((checkbox) => {
        if(checkbox.checkboxField.checked) {
          set.add(checkbox.text);
        }
      });
      return set;
    };

    const [inputValid, setInputValid] = createSignal(!inputField || inputField.isValid());
    if(inputField) {
      subscribeOn(inputField.input)('input', () => setInputValid(inputField.isValid()));
      onMount(() => inputField.input.focus());
    }

    const Buttons = () => {
      // the popup's own Enter shortcut goes to the only actionable button of a two-button pair
      const confirmButton = buttons.length === 2 ? buttons.find((button) => !button.isCancel) : undefined;
      // an input field speaks for the button that acts on it, never for Cancel
      const inputButton = inputField && buttons.find((button) => !button.isCancel);

      return (
        <PopupElement.Buttons class={buttons.length >= 3 ? 'is-vertical-layout' : undefined}>
          <For each={buttons}>{(button) => {
            const gate = button.onlyWithCheckbox;
            const [gateChecked, setGateChecked] = createSignal(!gate);
            if(gate) {
              onMount(() => {
                setGateChecked(gate.checkboxField.checked);
                subscribeOn(gate.checkboxField.input)('change', () => setGateChecked(gate.checkboxField.checked));
              });
            }

            return (
              <PopupElement.Button
                langKey={button.langKey}
                langArgs={button.langArgs}
                danger={button.isDanger}
                cancel={button.isCancel}
                noRipple={button.noRipple}
                iconLeft={button.iconLeft}
                iconRight={button.iconRight}
                disabled={!gateChecked() || (button === inputButton && !inputValid())}
                confirm={button === confirmButton}
                ref={(element) => button.element = element}
                // read at click time: a caller can swap the callback while the popup is up
                callback={(e) => button.callback?.(e, checkboxes && checkedSet())}
              >{button.text}</PopupElement.Button>
            );
          }}</For>
        </PopupElement.Buttons>
      );
    };

    const content = (
      <>
        {options.contentBefore}
        <Show when={hasDescription}>
          <Description options={options} />
        </Show>
        {inputField?.container}
        <For each={checkboxes}>{(checkbox) => (
          <RowTsx class="popup-peer-checkbox-row">
            <Show when={checkbox.text}>
              <RowTsx.Title>{i18n(checkbox.text, checkbox.textArgs)}</RowTsx.Title>
            </Show>
            <RowTsx.CheckboxField>
              <CheckboxFieldTsx
                {...checkbox}
                ref={(checkboxField) => checkbox.checkboxField = checkboxField}
              />
            </RowTsx.CheckboxField>
          </RowTsx>
        )}</For>
        {options.content}
      </>
    );

    return (
      <PopupElement
        {...options}
        class={'popup-peer' + (className ? ' ' + className : '')}
        show={show()}
        containerClass={checkboxes ? 'have-checkbox' : undefined}
        closable={options.closable ?? true}
        old
      >
        <Show when={!options.noHeader}>
          <PopupElement.Header>
            <Show when={options.avatar} fallback={options.peerId && <PeerAvatar options={options} />}>
              {options.avatar}
            </Show>
            <Show when={!options.noTitle}>
              <PopupElement.Title>{title(options)}</PopupElement.Title>
            </Show>
          </PopupElement.Header>
        </Show>
        {options.body ? <PopupElement.Body>{content}</PopupElement.Body> :
          options.scrollable ? <PopupElement.Scrollable>{content}</PopupElement.Scrollable> : content}
        {buttons && <Buttons />}
      </PopupElement>
    );
  });

  return {show: () => setShow(true), hide: () => setShow(false)};
}

function PeerAvatar(props: {options: PopupPeerOptions}) {
  const {peerId, threadId} = props.options;
  const isSavedDialog = !!(peerId === rootScope.myId && threadId);
  return (
    <AvatarNewTsx
      size={32}
      isDialog
      peerId={isSavedDialog ? threadId : peerId}
      threadId={isSavedDialog ? undefined : threadId}
      meAsNotes={isSavedDialog}
    />
  );
}

function title(options: PopupPeerOptions): JSX.Element {
  if(options.titleLangKey || !options.title) {
    return i18n(options.titleLangKey || 'AppName', options.titleLangArgs);
  }

  if(options.title instanceof HTMLElement || options.title instanceof DocumentFragment) {
    return options.title;
  }

  return options.title || '';
}
