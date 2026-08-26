import PopupElement, {addCancelButton, PopupButton, PopupOptions} from '.';
import {i18n, LangPackKey} from '@lib/langPack';
import CheckboxField, {CheckboxFieldOptions} from '@components/checkboxField';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {avatarNew} from '@components/avatarNew';
import toggleDisability from '@helpers/dom/toggleDisability';
import rootScope from '@lib/rootScope';
import InputField from '@components/inputField';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import RowTsx from '@components/rowTsx';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';

export type PopupPeerButton = Omit<PopupButton, 'callback'> & Partial<{callback: PopupPeerButtonCallback, onlyWithCheckbox: PopupPeerCheckboxOptions}>;
export type PopupPeerButtonCallbackCheckboxes = Set<LangPackKey>;
export type PopupPeerButtonCallback = (e: MouseEvent, checkboxes?: PopupPeerButtonCallbackCheckboxes) => void;
// the caption belongs to the row the popup builds around the checkbox, not to the checkbox itself;
// `text` doubles as the checkbox's identity in the button callbacks
export type PopupPeerCheckboxOptions = CheckboxFieldOptions & {
  text?: LangPackKey,
  textArgs?: any[],
  checkboxField?: CheckboxField
};

export type PopupPeerOptions = Omit<PopupOptions, 'buttons' | 'title'> & Partial<{
  peerId: PeerId,
  threadId: number,
  // for a peer the plain avatar can't draw on its own (a Community and its decoration);
  // the caller owns it and its teardown
  avatar: HTMLElement,
  title: string | HTMLElement | DocumentFragment,
  titleLangKey: LangPackKey,
  titleLangArgs: any[],
  noTitle: boolean,
  description: Parameters<typeof setInnerHTML>[1] | true,
  descriptionRaw: string,
  descriptionLangKey: LangPackKey,
  descriptionLangArgs: any[],
  buttons: Array<PopupPeerButton>,
  checkboxes: Array<PopupPeerCheckboxOptions>,
  inputField: InputField,
  old: boolean
}>;
export default class PopupPeer extends PopupElement {
  protected description: HTMLParagraphElement;
  private inputField?: InputField;

  constructor(private className: string, options: PopupPeerOptions = {}) {
    super('popup-peer' + (className ? ' ' + className : ''), {
      overlayClosable: true,
      ...options,
      title: true,
      buttons: options.buttons && addCancelButton(options.buttons)
    });

    if(options.avatar) {
      this.header.prepend(options.avatar);
    } else if(options.peerId) {
      const isSavedDialog = !!(options.peerId === rootScope.myId && options.threadId);
      const {node} = avatarNew({
        middleware: this.middlewareHelper.get(),
        size: 32,
        isDialog: true,
        peerId: isSavedDialog ? options.threadId : options.peerId,
        threadId: isSavedDialog ? undefined : options.threadId,
        meAsNotes: isSavedDialog
      });
      this.header.prepend(node);
    }

    if(!options.noTitle) {
      if(options.titleLangKey || !options.title) {
        this.title.append(i18n(options.titleLangKey || 'AppName', options.titleLangArgs));
      } else if(options.title instanceof HTMLElement || options.title instanceof DocumentFragment) {
        this.title.append(options.title);
      } else this.title.innerText = options.title || '';
    }

    const fragment = document.createDocumentFragment();

    if(options.descriptionLangKey || options.description || options.descriptionRaw) {
      const p = this.description = document.createElement('p');
      p.classList.add('popup-description');
      if(options.descriptionLangKey) p.append(i18n(options.descriptionLangKey, options.descriptionLangArgs));
      else if(options.description && options.description !== true) setInnerHTML(p, options.description);
      else if(options.descriptionRaw) p.append(wrapEmojiText(options.descriptionRaw));

      fragment.append(p);
    }

    if(options.inputField) {
      this.inputField = options.inputField;
      fragment.append(options.inputField.container);
      const button = options.buttons.find((button) => !button.isCancel);
      toggleDisability([button.element], !options.inputField.isValid());
    }

    if(options.checkboxes) {
      this.container.classList.add('have-checkbox');

      options.checkboxes.forEach((o) => {
        const checkboxOptions: CheckboxFieldOptions = o;
        const row = wrapSolidComponent(() => (
          <RowTsx class="popup-peer-checkbox-row">
            {o.text && <RowTsx.Title>{i18n(o.text, o.textArgs)}</RowTsx.Title>}
            <RowTsx.CheckboxField>
              <CheckboxFieldTsx
                {...checkboxOptions}
                ref={(checkboxField) => o.checkboxField = checkboxField}
              />
            </RowTsx.CheckboxField>
          </RowTsx>
        ), this.middlewareHelper.get());

        fragment.append(row);
      });

      options.buttons.forEach((button) => {
        if(button.callback) {
          const original = button.callback;
          button.callback = (e) => {
            const c: Set<LangPackKey> = new Set();
            options.checkboxes.forEach((o) => {
              if(o.checkboxField.checked) {
                c.add(o.text);
              }
            });
            original(e, c);
          };
        }

        const checkbox = button.onlyWithCheckbox;
        if(checkbox) {
          const onChange = () => {
            toggleDisability([button.element], !checkbox.checkboxField.checked);
          };
          this.listenerSetter.add(checkbox.checkboxField.input)('change', onChange);
          onChange();
        }
      });
    }

    if(options.inputField) {
      const button = options.buttons.find((button) => !button.isCancel);
      this.listenerSetter.add(options.inputField.input)('input', () => {
        toggleDisability([button.element], !options.inputField.isValid());
      });
    }

    this.header.after(fragment);
  }

  public show(animate?: boolean): void {
    super.show(animate);
    this.inputField?.input.focus();
  }
}
