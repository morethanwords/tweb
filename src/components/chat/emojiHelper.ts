import type ChatInput from "./input";
import { appendEmoji, getEmojiFromElement } from "../emoticonsDropdown/tabs/emoji";
import { ScrollableX } from "../scrollable";
import AutocompleteHelper from "./autocompleteHelper";
import AutocompleteHelperController from "./autocompleteHelperController";

export default class EmojiHelper extends AutocompleteHelper {
  private scrollable: ScrollableX;

  constructor(appendTo: HTMLElement, controller: AutocompleteHelperController, private chatInput: ChatInput) {
    super({
      appendTo,
      controller, 
      listType: 'x', 
      onSelect: (target) => {
        this.chatInput.onEmojiSelected(getEmojiFromElement(target as any), true);
      }
    });

    this.container.classList.add('emoji-helper');
  }

  protected init() {
    this.list = document.createElement('div');
    this.list.classList.add('emoji-helper-emojis', 'super-emojis');

    this.container.append(this.list);

    this.scrollable = new ScrollableX(this.container);

    this.addEventListener('visible', () => {
      setTimeout(() => { // it is not rendered yet
        this.scrollable.container.scrollLeft = 0;
      }, 0);
    });
  }

  public render(emojis: string[], waitForKey: boolean) {
    if(this.init) {
      if(!emojis.length) {
        return;
      }

      this.init();
      this.init = null;
    }

    if(emojis.length) {
      this.list.innerHTML = '';
      emojis.forEach(emoji => {
        appendEmoji(emoji, this.list, false, true);
      });
    }

    this.waitForKey = waitForKey ? 'ArrowUp' : undefined;
    this.toggle(!emojis.length);
  }
}
