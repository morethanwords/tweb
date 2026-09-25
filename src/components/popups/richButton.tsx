import {createEffect, createSignal, For, Show} from 'solid-js';
import normalizeLinkUrl from '@helpers/string/normalizeLinkUrl';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {i18n, LangPackKey} from '@lib/langPack';
import InputField from '@components/inputField';
import PopupElement, {createPopup, usePopupContext} from '@components/popups/indexTsx';
import {ChipTab, ChipTabs} from '@components/chipTabs';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import Row from '@components/rowTsx';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import {showPickUser2Popup} from '@components/popups/pickUser';
import {getPageButtonClasses} from '@components/instantViewFormatting';
import type {
  ChatInputRichButton,
  ChatInputRichButtonAction,
  ChatInputRichButtonColor
} from '@components/chat/inputEditor/types';

export type RichButtonPopupOptions = {
  // the button being edited; a new one is made when absent
  button?: ChatInputRichButton,
  // offer to put a new button on a line of its own (`pageBlockButtonRow`) — desktop's
  // "Separate Line Button"; `separateLine` is where the switch starts
  canChooseLine?: boolean,
  separateLine?: boolean
};

export type RichButtonPopupResult =
  {button: ChatInputRichButton, separateLine: boolean} |
  {delete: true};

const ACTIONS: [ChatInputRichButtonAction, LangPackKey][] = [
  ['url', 'Chat.Input.Editor.Button.ActionUrl'],
  ['copy', 'Chat.Input.Editor.Button.ActionCopy'],
  ['userProfile', 'Chat.Input.Editor.Button.ActionProfile'],
  ['disabled', 'Chat.Input.Editor.Button.ActionDisabled']
];

const COLORS: [ChatInputRichButtonColor | '', LangPackKey][] = [
  ['', 'Chat.Input.Editor.Button.StyleDefault'],
  ['primary', 'Chat.Input.Editor.Button.StylePrimary'],
  ['success', 'Chat.Input.Editor.Button.StyleSuccess'],
  ['danger', 'Chat.Input.Editor.Button.StyleDanger']
];

let captionIdSeed = 0;

/**
 * Makes or edits a button of layer 229 in the composer: its text, what it does and how it looks,
 * the way desktop's "Add Button" box does. Rejects when dismissed.
 */
export default function showRichButtonPopup(
  options: RichButtonPopupOptions = {}
): Promise<RichButtonPopupResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const editing = !!options.button;
    createPopup(() => {
      const button = options.button;
      const [action, setAction] = createSignal<ChatInputRichButtonAction>(button?.action || 'url');
      const [color, setColor] = createSignal<ChatInputRichButtonColor | ''>(button?.color || '');
      const [userId, setUserId] = createSignal<UserId>(button?.userId);
      const [separateLine, setSeparateLine] = createSignal(!!options.separateLine);
      const [noUser, setNoUser] = createSignal(false);

      const textInputField = new InputField({
        label: 'Chat.Input.Editor.Button.Text',
        plainText: true,
        required: true,
        withLinebreaks: false
      });
      const urlInputField = new InputField({
        label: 'URL',
        plainText: true,
        required: true,
        validate: () => !!normalizeLinkUrl(urlInputField.value),
        withLinebreaks: false
      });
      const copyInputField = new InputField({
        label: 'Chat.Input.Editor.Button.CopyText',
        plainText: true,
        required: true
      });
      const urlInput = urlInputField.input as HTMLInputElement;
      urlInput.autocapitalize = 'none';
      urlInput.spellcheck = false;
      if(button?.text) textInputField.setValueSilently(button.text);
      if(button?.url) urlInputField.setValueSilently(button.url);
      if(button?.copyText) copyInputField.setValueSilently(button.copyText);

      const [revision, setRevision] = createSignal(0);
      const bump = () => setRevision(revision() + 1);
      [textInputField, urlInputField, copyInputField].forEach((field) => {
        subscribeOn(field.input)('input', bump);
      });

      const valid = () => {
        revision();
        if(!textInputField.value.trim()) return false;
        switch(action()) {
          case 'url': return urlInputField.isValid();
          case 'copy': return !!copyInputField.value;
          default: return true;
        }
      };

      const chooseUser = async() => {
        try {
          const peerId = await showPickUser2Popup({
            peerType: ['dialogs', 'contacts'],
            filterPeerTypeBy: ['isRegularUser', 'isBot'],
            titleLangKey: 'Chat.Input.Editor.Button.ChooseUser',
            placeholder: 'Search'
          });
          setUserId(peerId.toUserId());
          setNoUser(false);
        } catch{}
      };

      // the captions name the choices under them
      const actionCaptionId = `popup-rich-button-action-${++captionIdSeed}`;
      const styleCaptionId = `popup-rich-button-style-${captionIdSeed}`;

      const Fields = () => {
        const popup = usePopupContext();
        createEffect(() => {
          if(!popup.shown()) return;
          // The shell blurs the previous field while opening. Focus ours once that finishes.
          queueMicrotask(() => {
            if(popup.destroyed || !popup.shown()) return;
            textInputField.input.focus();
            textInputField.select();
          });
        });

        return (
          <div class="popup-rich-button-fields">
            {textInputField.container}
            <div id={actionCaptionId} class="popup-rich-button-caption"><I18nTsx key="Chat.Input.Editor.Button.Action" /></div>
            <ChipTabs
              ref={(element) => element.setAttribute('aria-labelledby', actionCaptionId)}
              view="secondary"
              // the popup is still scaling in on the first frame: place the marker once it is shown
              needIntersectionObserver
              value={action()}
              onChange={(value) => void setAction(value as ChatInputRichButtonAction)}
            >
              <For each={ACTIONS}>
                {([value, langKey]) => <ChipTab value={value}><I18nTsx key={langKey} /></ChipTab>}
              </For>
            </ChipTabs>
            <Show when={action() === 'url'}>{urlInputField.container}</Show>
            <Show when={action() === 'copy'}>{copyInputField.container}</Show>
            <Show when={action() === 'userProfile'}>
              <Row clickable={chooseUser}>
                <Row.Icon icon="user" />
                <Row.Title>
                  <Show when={userId()} fallback={<I18nTsx key="Chat.Input.Editor.Button.ChooseUser" />}>
                    <PeerTitleTsx peerId={userId().toPeerId(false)} />
                  </Show>
                </Row.Title>
                <Show when={noUser()}>
                  <Row.Subtitle><span class="danger" role="alert"><I18nTsx key="Chat.Input.Editor.Button.NoUser" /></span></Row.Subtitle>
                </Show>
              </Row>
            </Show>
            <div id={styleCaptionId} class="popup-rich-button-caption"><I18nTsx key="Chat.Input.Editor.Button.Style" /></div>
            <div class="popup-rich-button-styles" role="group" aria-labelledby={styleCaptionId}>
              <For each={COLORS}>
                {([value, langKey]) => (
                  <button
                    type="button"
                    class={classNames(
                      ...getPageButtonClasses(value || undefined),
                      'popup-rich-button-style',
                      color() === value && 'is-active'
                    )}
                    aria-pressed={color() === value}
                    onClick={() => setColor(value)}
                  >
                    <I18nTsx key={langKey} />
                  </button>
                )}
              </For>
            </div>
            <Show when={options.canChooseLine}>
              <Row>
                <Row.CheckboxFieldToggle>
                  <CheckboxFieldTsx toggle checked={separateLine()} onChange={setSeparateLine} />
                </Row.CheckboxFieldToggle>
                <Row.Title><I18nTsx key="Chat.Input.Editor.Button.SeparateLine" /></Row.Title>
              </Row>
            </Show>
          </div>
        );
      };

      const submit = () => {
        if(!valid()) return false;
        if(action() === 'userProfile' && !userId()) {
          setNoUser(true);
          return false;
        }

        const result: ChatInputRichButton = {
          text: textInputField.value.trim(),
          action: action(),
          color: color() || undefined,
          link: button?.link
        };
        if(action() === 'url') result.url = normalizeLinkUrl(urlInputField.value);
        else if(action() === 'copy') result.copyText = copyInputField.value;
        else if(action() === 'userProfile') result.userId = userId();
        settled = true;
        resolve({button: result, separateLine: separateLine()});
      };

      return (
        <PopupElement class="popup-rich-button" closable onClose={() => {if(!settled) reject();}}>
          <PopupElement.Header>
            <PopupElement.CloseButton />
            <PopupElement.Title>
              {i18n(editing ? 'Chat.Input.Editor.Button.EditTitle' : 'Chat.Input.Editor.Button.CreateTitle')}
            </PopupElement.Title>
          </PopupElement.Header>
          <PopupElement.Body>
            <Fields />
          </PopupElement.Body>
          <PopupElement.Footer>
            <PopupElement.FooterButton
              confirm
              disabled={!valid()}
              langKey={editing ? 'Save' : 'Create'}
              callback={submit}
            />
            <Show when={editing}>
              <PopupElement.FooterButton
                color="danger"
                langKey="Chat.Input.Editor.Button.Delete"
                callback={() => {
                  settled = true;
                  resolve({delete: true});
                }}
              />
            </Show>
          </PopupElement.Footer>
        </PopupElement>
      );
    });
  });
}
