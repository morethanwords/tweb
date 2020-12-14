import type { AppImManager } from "../../lib/appManagers/appImManager";
import { MarkdownType, cancelEvent, getSelectedNodes, markdownTags, findUpClassName, attachClickEvent, cancelSelection } from "../../helpers/dom";
import RichTextProcessor from "../../lib/richtextprocessor";
import ButtonIcon from "../buttonIcon";
import { clamp } from "../../helpers/number";
import { isTouchSupported } from "../../helpers/touchSupport";
import { isApple } from "../../helpers/userAgent";

export default class MarkupTooltip {
  public container: HTMLElement;
  private wrapper: HTMLElement;
  private buttons: {[type in MarkdownType]: HTMLElement} = {} as any;
  private linkBackButton: HTMLElement;
  private linkApplyButton: HTMLButtonElement;
  private hideTimeout: number;
  private addedListener = false;
  private waitingForMouseUp = false;
  private linkInput: HTMLInputElement;
  private savedRange: Range;
  mouseUpCounter: number = 0;

  constructor(private appImManager: AppImManager) {

  }

  private init() {
    this.container = document.createElement('div');
    this.container.classList.add('markup-tooltip', 'z-depth-1', 'hide');

    this.wrapper = document.createElement('div');
    this.wrapper.classList.add('markup-tooltip-wrapper');
    
    const tools1 = document.createElement('div');
    const tools2 = document.createElement('div');
    tools1.classList.add('markup-tooltip-tools');
    tools2.classList.add('markup-tooltip-tools');

    const arr = ['bold', 'italic', 'underline', 'strikethrough', 'monospace', 'link'] as (keyof MarkupTooltip['buttons'])[];
    arr.forEach(c => {
      const button = ButtonIcon(c, {noRipple: true});
      tools1.append(this.buttons[c] = button);

      if(c !== 'link') {
        button.addEventListener('click', () => {
          this.appImManager.chat.input.applyMarkdown(c);
          this.hide();
        });
      } else {
        attachClickEvent(button, (e) => {
          cancelEvent(e);
          this.container.classList.add('is-link');

          const selection = document.getSelection();
          this.savedRange = selection.getRangeAt(0);
          
          if(button.classList.contains('active')) {
            const startContainer = this.savedRange.startContainer;
            const anchor = startContainer.parentElement as HTMLAnchorElement;
            this.linkInput.value = anchor.href;
          } else {
            this.linkInput.value = '';
          }

          this.setTooltipPosition(true);

          setTimeout(() => {
            this.linkInput.focus(); // !!! instant focus will break animation
          }, 200);
          this.linkInput.classList.toggle('is-valid', this.isLinkValid());
        });
      }
    });

    this.linkBackButton = ButtonIcon('back', {noRipple: true});
    this.linkInput = document.createElement('input');
    this.linkInput.placeholder = 'Enter URL...';
    this.linkInput.classList.add('input-clear');
    this.linkInput.addEventListener('keydown', (e) => {
      const valid = !this.linkInput.value.length || !!RichTextProcessor.matchUrl(this.linkInput.value);///^(http)|(https):\/\//i.test(this.linkInput.value);

      if(e.code == 'Enter') {
        if(!valid) {
          if(this.linkInput.classList.contains('error')) {
            this.linkInput.classList.remove('error');
            void this.linkInput.offsetLeft; // reflow
          }

          this.linkInput.classList.add('error');
        } else {
          this.applyLink(e);
        }
      }
    });

    this.linkInput.addEventListener('input', (e) => {
      const valid = this.isLinkValid();

      this.linkInput.classList.toggle('is-valid', valid);
      this.linkInput.classList.remove('error');
    });

    attachClickEvent(this.linkBackButton, (e) => {
      cancelEvent(e);
      this.container.classList.remove('is-link');
      //input.value = '';
      this.resetSelection();
      this.setTooltipPosition();
    });

    this.linkApplyButton = ButtonIcon('check markup-tooltip-link-apply', {noRipple: true});
    attachClickEvent(this.linkApplyButton, (e) => {
      cancelEvent(e);
      this.applyLink(e);
    });

    const applyDiv = document.createElement('div');
    applyDiv.classList.add('markup-tooltip-link-apply-container');
    
    const delimiter1 = document.createElement('span');
    const delimiter2 = document.createElement('span');
    const delimiter3 = document.createElement('span');
    delimiter1.classList.add('markup-tooltip-delimiter');
    delimiter2.classList.add('markup-tooltip-delimiter');
    delimiter3.classList.add('markup-tooltip-delimiter');
    tools1.insertBefore(delimiter1, this.buttons.link);
    applyDiv.append(delimiter3, this.linkApplyButton);
    tools2.append(this.linkBackButton, delimiter2, this.linkInput, applyDiv);
    //tools1.insertBefore(delimiter2, this.buttons.link.nextSibling);

    this.wrapper.append(tools1, tools2);
    this.container.append(this.wrapper);
    document.body.append(this.container);
    
    window.addEventListener('resize', () => {
      this.hide();
    });
  }

  private applyLink(e: Event) {
    cancelEvent(e);
    this.resetSelection();
    this.appImManager.chat.input.applyMarkdown('link', this.linkInput.value);
    this.hide();
  }

  private isLinkValid() {
    return !this.linkInput.value.length || !!RichTextProcessor.matchUrl(this.linkInput.value);
  }

  private resetSelection(range: Range = this.savedRange) {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    this.appImManager.chat.input.messageInput.focus();
  }

  public hide() {
    if(this.init) return;

    this.container.classList.remove('is-visible');
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('mouseup', this.onMouseUpSingle);
    this.waitingForMouseUp = false;

    if(this.hideTimeout) clearTimeout(this.hideTimeout);
    this.hideTimeout = window.setTimeout(() => {
      this.hideTimeout = undefined;
      this.container.classList.add('hide');
      this.container.classList.remove('is-link');
    }, 200);
  }

  public getActiveMarkupButton() {
    const nodes = getSelectedNodes();
    const parents = [...new Set(nodes.map(node => node.parentNode))];
    if(parents.length > 1) return undefined;

    const node = parents[0] as HTMLElement;
    let currentMarkup: HTMLElement;
    for(const type in markdownTags) {
      const tag = markdownTags[type as MarkdownType];
      if(node.matches(tag.match)) {
        currentMarkup = this.buttons[type as MarkdownType];
        break;
      }
    }

    return currentMarkup;
  }

  public setActiveMarkupButton() {
    const activeButton = this.getActiveMarkupButton();

    for(const i in this.buttons) {
      // @ts-ignore
      const button = this.buttons[i];
      if(button != activeButton) {
        button.classList.remove('active');
      }
    }

    if(activeButton) {
      activeButton.classList.add('active');
    }

    return activeButton;
  }

  private setTooltipPosition(isLinkToggle = false) {
    const selection = document.getSelection();
    const range = selection.getRangeAt(0);

    const bodyRect = document.body.getBoundingClientRect();
    const selectionRect = range.getBoundingClientRect();
    const inputRect = this.appImManager.chat.input.rowsWrapper.getBoundingClientRect();

    this.container.style.maxWidth = inputRect.width + 'px';

    const selectionTop = selectionRect.top + (bodyRect.top * -1);
    
    const currentTools = this.container.classList.contains('is-link') ? this.wrapper.lastElementChild : this.wrapper.firstElementChild;

    const sizesRect = currentTools.getBoundingClientRect();
    const top = selectionTop - sizesRect.height - 8;
    
    const minX = inputRect.left;
    const maxX = (inputRect.left + inputRect.width) - Math.min(inputRect.width, sizesRect.width);
    let left: number;
    if(isLinkToggle) {
      const containerRect = this.container.getBoundingClientRect();
      left = clamp(containerRect.left, minX, maxX);
    } else {
      const x = selectionRect.left + (selectionRect.width - sizesRect.width) / 2;
      left = clamp(x, minX, maxX);
    }

    /* const isClamped = x !== minX && x !== maxX && (left === minX || left === maxX || this.container.getBoundingClientRect().left >= maxX);

    if(isLinkToggle && this.container.classList.contains('is-link') && !isClamped) return; */
    
    this.container.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }

  public show() {
    if(this.init) {
      this.init();
      this.init = null;
    }

    const selection = document.getSelection();

    if(!selection.toString().trim().length) {
      this.hide();
      return;
    }

    if(this.hideTimeout !== undefined) {
      clearTimeout(this.hideTimeout);
    }

    if(this.container.classList.contains('is-visible')) {
      return;
    }

    this.setActiveMarkupButton();
    
    this.container.classList.remove('is-link');
    const isFirstShow = this.container.classList.contains('hide');
    if(isFirstShow) {
      this.container.classList.remove('hide');
      this.container.classList.add('no-transition');
    }
    
    this.setTooltipPosition();
    
    if(isFirstShow) {
      void this.container.offsetLeft; // reflow
      this.container.classList.remove('no-transition');
    }
    
    this.container.classList.add('is-visible');

    //console.log('selection', selectionRect, activeButton);
  }

  private onMouseUp = (e: Event) => {
    if(findUpClassName(e.target, 'markup-tooltip')) return;
    /* if(isTouchSupported) {
      this.appImManager.chat.input.messageInput.focus();
      cancelEvent(e);
    } */

    this.hide();
    document.removeEventListener('mouseup', this.onMouseUp);
  };

  private onMouseUpSingle = (e: Event) => {
    this.waitingForMouseUp = false;

    if(isTouchSupported) {
      cancelEvent(e);
      if(this.mouseUpCounter++ == 0) {
        this.resetSelection(this.savedRange);
      } else {
        this.hide();
        return;
      }
    }

    this.show();

    !isTouchSupported && document.addEventListener('mouseup', this.onMouseUp);
  };

  public setMouseUpEvent() {
    if(this.waitingForMouseUp) return;
    this.waitingForMouseUp = true;

    console.log('[MARKUP]: setMouseUpEvent');

    document.addEventListener('mouseup', this.onMouseUpSingle, {once: true});
  }

  public handleSelection() {
    if(this.addedListener) return;
    this.addedListener = true;
    document.addEventListener('selectionchange', (e) => {
      if(document.activeElement == this.linkInput) {
        return;
      }

      if(document.activeElement != this.appImManager.chat.input.messageInput) {
        this.hide();
        return;
      }

      const selection = document.getSelection();

      if(!selection.toString().trim().length) {
        this.hide();
        return;
      }

      console.log('[MARKUP]: selectionchange');
      if(isTouchSupported) {
        if(isApple) {
          this.show();
          this.setTooltipPosition(); // * because can skip this in .show();
        } else {
          if(this.mouseUpCounter == 2) {
            this.mouseUpCounter = 0;
            return;
          }

          this.savedRange = selection.getRangeAt(0);
          this.setMouseUpEvent();
          /* document.addEventListener('touchend', (e) => {
            cancelEvent(e);
            this.resetSelection(range);
            this.show();
          }, {once: true, passive: false}); */
        }
      } else {
        this.setMouseUpEvent();
      }
    });
  }
}