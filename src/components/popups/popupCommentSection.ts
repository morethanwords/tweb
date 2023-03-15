import ListenerSetter from "../../helpers/listenerSetter";
import InputFieldAnimated from "../inputFieldAnimated";
import Scrollable from "../scrollable";
import {AppManagers} from "../../lib/appManagers/managers";
import ButtonIcon from "../buttonIcon";
import safeAssign from "../../helpers/object/safeAssign";
import SettingSection from "../settingSection";
import EmojiTab, {getEmojiFromElement} from "../emoticonsDropdown/tabs/emoji";
import {MessageEntity} from "../../layer";
import getEmojiEntityFromEmoji from "../../lib/richTextProcessor/getEmojiEntityFromEmoji";
import {insertRichTextAsHTML} from "../inputField";
import {EmoticonsDropdown} from "../emoticonsDropdown";
import {attachClickEvent} from "../../helpers/dom/clickEvent";
import cancelEvent from "../../helpers/dom/cancelEvent";
import IS_TOUCH_SUPPORTED from "../../environment/touchSupport";
import {i18n, LangPackKey} from "../../lib/langPack";
import ripple from "../ripple";
import {IS_MOBILE} from "../../environment/userAgent";

export class CommentSection {

  public container: HTMLElement;
  public onSubmit: (message: string) => void;
  private listenerSetter: ListenerSetter;
  private btnToggleEmoticons: HTMLAnchorElement | HTMLButtonElement;
  private inputContainer: HTMLDivElement;
  public messageInputField: InputFieldAnimated;
  private scrollable: Scrollable;
  protected managers: AppManagers;
  private btnConfirm: HTMLButtonElement;
  confirmMessage: LangPackKey

  private createButtonIcon(...args: Parameters<typeof ButtonIcon>) {
    const button = ButtonIcon(...args);
    return button;
  }

  constructor(options: {
    container: HTMLElement,
    onSubmit: (message: string) => void,
    managers: AppManagers,
    scrollable: Scrollable,
    confirmMessage?: LangPackKey
    btnConfirm?: HTMLButtonElement
  }) {
    if(!options.btnConfirm) {
      this.btnConfirm = document.createElement('button');
      this.btnConfirm.classList.add('btn-primary', 'btn-color-primary');
      options.confirmMessage ? this.btnConfirm.append(i18n(options.confirmMessage)) : this.btnConfirm.append(i18n('Modal.Send'));
      ripple(this.btnConfirm);
    }
    safeAssign(this, options);
  }

  public construct = async() => {
    const section = new SettingSection({});
    section.innerContainer.classList.add('popup-comment-container');
    const div = document.createElement('div');
    div.classList.add('popup-comment');

    const inputContainer = this.inputContainer = document.createElement('div');
    inputContainer.classList.add('popup-input-container');


    this.listenerSetter = new ListenerSetter();
    if(!IS_MOBILE) {
      const customOnSelect = (emoji: ReturnType<typeof getEmojiFromElement>) => {
        const getEntityFromEmoji = (emoji: ReturnType<typeof getEmojiFromElement>) => {
          const entity: MessageEntity = emoji.docId ? {
            _: 'messageEntityCustomEmoji',
            document_id: emoji.docId,
            length: emoji.emoji.length,
            offset: 0
          } : getEmojiEntityFromEmoji(emoji.emoji);
          return entity;
        };
        insertRichTextAsHTML(this.messageInputField.input, emoji.emoji, [getEntityFromEmoji(emoji)], null)
      }
      this.btnToggleEmoticons = this.createButtonIcon('none toggle-emoticons', {noRipple: true});
      const emoticonsDropdown = new EmoticonsDropdown({
        customAnchorElement: this.container,
        customParentElement: this.container.parentElement, tabsToRender: [new EmojiTab({
          managers: this.managers,
          onClick: customOnSelect,
          isStandalone: true,
          showInnerMenuAnyway: true
        })]
      });
      this.container.append(emoticonsDropdown.getElement());
      emoticonsDropdown.attachButtonListener(this.btnToggleEmoticons, this.listenerSetter);
      this.listenerSetter.add(emoticonsDropdown)('open', this.onEmoticonsOpen);
      this.listenerSetter.add(emoticonsDropdown)('close', this.onEmoticonsClose);
      div.append(this.btnToggleEmoticons);
    }
    div.append(inputContainer);
    section.innerContainer.append(div);
    this.container.append(section.innerContainer);
    attachClickEvent(this.btnConfirm, (e) => {
      cancelEvent(e);
      this.onSubmit(this.messageInputField.value);
    })
    await this.createMessageContainer(section.innerContainer);
  }

  private createMessageContainer = async(inputContainer: HTMLElement) => {
    const c = document.createElement('div');
    c.classList.add('popup-input-inputs', 'input-message-container');
    const captionMaxLength = await this.managers.apiManager.getLimit('caption');
    this.messageInputField = new InputFieldAnimated({
      placeholder: 'PreviewSender.CaptionPlaceholder',
      name: 'message',
      withLinebreaks: true,
      maxLength: captionMaxLength
    });

    this.listenerSetter.add(this.scrollable.container)('scroll', this.onScroll);
    this.listenerSetter.add(this.messageInputField.input)('scroll', this.onScroll);

    this.messageInputField.input.classList.replace('input-field-input', 'input-message-input');
    this.messageInputField.inputFake.classList.replace('input-field-input', 'input-message-input');
    c.append(this.messageInputField.input, this.messageInputField.inputFake);
    inputContainer.append(c, this.btnConfirm);
  }
  private onEmoticonsOpen = () => {
    const toggleClass = IS_TOUCH_SUPPORTED ? 'flip-icon' : 'active';
    this.btnToggleEmoticons.classList.toggle(toggleClass, true);
  };

  private onEmoticonsClose = () => {
    const toggleClass = IS_TOUCH_SUPPORTED ? 'flip-icon' : 'active';
    this.btnToggleEmoticons.classList.toggle(toggleClass, false);
  };
  private onScroll = () => {
    const {input} = this.messageInputField;
    this.scrollable.onAdditionalScroll();
    if(input.scrollTop > 0 && input.scrollHeight > 130) {
      this.scrollable.container.classList.remove('scrolled-bottom');
    }
  };
}

