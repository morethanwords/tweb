import type ChatInput from "./input";
import attachListNavigation from "../../helpers/dom/attachlistNavigation";
import { appendEmoji, getEmojiFromElement } from "../emoticonsDropdown/tabs/emoji";
import { ScrollableX } from "../scrollable";
import AutocompleteHelper from "./autocompleteHelper";

export default class EmojiHelper extends AutocompleteHelper {
  private emojisContainer: HTMLDivElement;
  private scrollable: ScrollableX;

  constructor(appendTo: HTMLElement, private chatInput: ChatInput) {
    super(appendTo);

    this.container.classList.add('emoji-helper');

    this.addEventListener('visible', () => {
      const list = this.emojisContainer;
      const {detach} = attachListNavigation({
        list, 
        type: 'x',
        onSelect: (target) => {
          this.chatInput.onEmojiSelected(getEmojiFromElement(target as any), true);
        },
        once: true
      });

      this.addEventListener('hidden', () => {
        list.innerHTML = '';
        detach();
      }, true);
    });
  }

  private init() {
    this.emojisContainer = document.createElement('div');
    this.emojisContainer.classList.add('emoji-helper-emojis', 'super-emojis');

    this.container.append(this.emojisContainer);

    this.scrollable = new ScrollableX(this.container);
  }

  public renderEmojis(emojis: string[]) {
    if(this.init) {
      this.init();
      this.init = null;
    }

    if(emojis.length) {
      this.emojisContainer.innerHTML = '';
      emojis.forEach(emoji => {
        appendEmoji(emoji, this.emojisContainer);
      });
    }

    this.toggle(!emojis.length);
  }
}
