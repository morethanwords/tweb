import {createEffect, createSignal, For, onCleanup, Show} from 'solid-js';
import normalizeLinkUrl from '@helpers/string/normalizeLinkUrl';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import InputField from '@components/inputField';
import PopupElement, {createPopup, usePopupContext} from '@components/popups/indexTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import RadioFormTsx from '@components/radioFormTsx';
import Row from '@components/rowTsx';
import ensureButtonSemantics from '@helpers/dom/ensureButtonSemantics';
import isLastInputPointer from '@helpers/dom/inputModality';
import Section from '@components/section';
import appDialogsManager from '@lib/appDialogsManager';
import {SERVICE_PEER_ID} from '@appManagers/constants';
import rootScope from '@lib/rootScope';
import {getMiddleware} from '@helpers/middleware';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import getUserStatusString from '@components/wrappers/getUserStatusString';
import {showPickUser2Popup} from '@components/popups/pickUser';
import {getPageButtonClasses, getPageButtonRowClasses} from '@components/instantViewFormatting';
import styles from '@components/popups/richButton.module.scss';
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
  ['userProfile', 'Chat.Input.Editor.Button.ActionMention'],
  ['disabled', 'Chat.Input.Editor.Button.ActionDisabled']
];

// two rows of two: four of them side by side would not fit their labels in the box
const COLOR_ROWS: [ChatInputRichButtonColor | '', LangPackKey][][] = [
  [
    ['', 'Chat.Input.Editor.Button.StyleDefault'],
    ['primary', 'Chat.Input.Editor.Button.StylePrimary']
  ],
  [
    ['success', 'Chat.Input.Editor.Button.StyleSuccess'],
    ['danger', 'Chat.Input.Editor.Button.StyleDanger']
  ]
];

/**
 * The user a mention button opens, drawn as the picker drew them — avatar, name, status — and
 * pressed to choose another.
 */
function MentionedUser(props: {userId: UserId, onClick: () => void}) {
  const list = appDialogsManager.createChatList();

  createEffect(() => {
    const peerId = props.userId.toPeerId(false);
    const middlewareHelper = getMiddleware();
    onCleanup(() => middlewareHelper.destroy());
    const middleware = middlewareHelper.get();
    list.replaceChildren();
    const {dom} = appDialogsManager.addDialogNew({
      peerId,
      container: list,
      rippleEnabled: true,
      avatarSize: 'abitbigger',
      // the button opens this person's profile, even when it is one's own
      meAsSaved: false,
      wrapOptions: {middleware}
    });
    // a row of a list elsewhere, a link with nowhere to go here: a button that picks another user
    ensureButtonSemantics(dom.listEl);
    attachClickEvent(dom.listEl, props.onClick);
    void rootScope.managers.appUsersManager.getUser(props.userId).then((user) => {
      if(middleware()) dom.lastMessageSpan.replaceChildren(getUserStatusString(user));
    });
  });

  return list;
}

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

      // `fallback` is the action to go back to when the picker is closed without a user
      const chooseUser = async(fallback?: ChatInputRichButtonAction) => {
        try {
          // one's contacts, as desktop offers them: not oneself, a bot or Telegram's service account
          const peerId = await showPickUser2Popup({
            peerType: ['contacts'],
            filterPeerTypeBy: ['isRegularUser'],
            exceptSelf: true,
            excludePeerIds: new Set([SERVICE_PEER_ID]),
            titleLangKey: 'Chat.Input.Editor.Button.ChooseUser',
            placeholder: 'Search'
          });
          setUserId(peerId.toUserId());
          setNoUser(false);
        } catch{
          if(fallback && !userId()) setAction(fallback);
        }
      };

      // A mention is nothing without its user, so clicking it goes straight to the picker. Arrows
      // select every action they pass: from the keyboard the "Choose User" row leads there instead,
      // or each step over Mention would open a popup.
      const changeAction = (value: ChatInputRichButtonAction) => {
        const previous = action();
        setAction(value);
        if(value === 'userProfile' && isLastInputPointer()) void chooseUser(previous);
      };

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

        // sections without names: what each holds speaks for itself, and the groups are named for
        // assistive tech instead
        return (
          <>
            <Section noDelimiter>
              {textInputField.container}
            </Section>
            <Section>
              <div
                class={styles.styles}
                role="group"
                aria-label={I18n.format('Chat.Input.Editor.Button.Style', true)}
              >
                <For each={COLOR_ROWS}>
                  {(row) => (
                    <div class={classNames(...getPageButtonRowClasses())}>
                      <For each={row}>
                        {([value, langKey]) => (
                          <button
                            type="button"
                            class={classNames(
                              ...getPageButtonClasses(value || undefined),
                              color() === value && styles.styleActive
                            )}
                            aria-pressed={color() === value}
                            onClick={() => setColor(value)}
                          >
                            <I18nTsx key={langKey} />
                          </button>
                        )}
                      </For>
                    </div>
                  )}
                </For>
              </div>
            </Section>
            <Section>
              <div role="radiogroup" aria-label={I18n.format('Chat.Input.Editor.Button.Action', true)}>
                <RadioFormTsx
                  values={ACTIONS.map(([value, langPackKey]) => ({value, langPackKey}))}
                  selected={action()}
                  onChange={changeAction}
                />
              </div>
              <Show when={action() === 'url'}>
                <div class={styles.result}>{urlInputField.container}</div>
              </Show>
              <Show when={action() === 'copy'}>
                <div class={styles.result}>{copyInputField.container}</div>
              </Show>
              <Show when={action() === 'userProfile'}>
                <Show
                  when={userId()}
                  fallback={
                    <Row clickable={() => void chooseUser()}>
                      <Row.Icon icon="user" />
                      <Row.Title><I18nTsx key="Chat.Input.Editor.Button.ChooseUser" /></Row.Title>
                      <Show when={noUser()}>
                        <Row.Subtitle><span class="danger" role="alert"><I18nTsx key="Chat.Input.Editor.Button.NoUser" /></span></Row.Subtitle>
                      </Show>
                    </Row>
                  }
                >
                  {(userId) => <MentionedUser userId={userId()} onClick={() => void chooseUser()} />}
                </Show>
              </Show>
            </Section>
            <Show when={options.canChooseLine}>
              <Section>
                <Row>
                  <Row.CheckboxFieldToggle>
                    <CheckboxFieldTsx toggle checked={separateLine()} onChange={setSeparateLine} />
                  </Row.CheckboxFieldToggle>
                  <Row.Title><I18nTsx key="Chat.Input.Editor.Button.SeparateLine" /></Row.Title>
                </Row>
              </Section>
            </Show>
          </>
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
        // `popup-rich-button` is what the e2e suite finds the box by; the look is the module's
        <PopupElement class={classNames('popup-rich-button', styles.popup)} closable onClose={() => {if(!settled) reject();}}>
          <PopupElement.Header>
            <PopupElement.CloseButton />
            <PopupElement.Title>
              {i18n(editing ? 'Chat.Input.Editor.Button.EditTitle' : 'Chat.Input.Editor.Button.CreateTitle')}
            </PopupElement.Title>
          </PopupElement.Header>
          <PopupElement.Scrollable>
            <PopupElement.Body>
              <Fields />
            </PopupElement.Body>
          </PopupElement.Scrollable>
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
