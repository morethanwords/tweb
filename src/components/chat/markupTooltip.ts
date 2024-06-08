/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ButtonIcon from '../buttonIcon';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import {IS_APPLE, IS_MOBILE} from '../../environment/userAgent';
import appNavigationController from '../appNavigationController';
import {_i18n} from '../../lib/langPack';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import isSelectionEmpty from '../../helpers/dom/isSelectionEmpty';
import {MarkdownType} from '../../helpers/dom/getRichElementValue';
import getVisibleRect from '../../helpers/dom/getVisibleRect';
import clamp from '../../helpers/number/clamp';
import matchUrl from '../../lib/richTextProcessor/matchUrl';
import matchUrlProtocol from '../../lib/richTextProcessor/matchUrlProtocol';
import getMarkupInSelection from '../../helpers/dom/getMarkupInSelection';
import {applyMarkdown} from '../../helpers/dom/markdown';
import findUpClassName from '../../helpers/dom/findUpClassName';
import overlayCounter from '../../helpers/overlayCounter';

export type MarkupTooltipTypes = Extract<MarkdownType, 'bold' | 'italic' | 'underline' | 'strikethrough' | 'monospace' | 'spoiler' | 'quote' | 'link'>;

export default class MarkupTooltip {
  private static INSTANCE: MarkupTooltip;

  public container: HTMLElement;
  private wrapper: HTMLElement;
  private buttons: {[type in MarkupTooltipTypes]: HTMLElement} = {} as any;
  private linkBackButton: HTMLElement;
  private linkApplyButton: HTMLButtonElement;
  private hideTimeout: number;
  private addedListener = false;
  private waitingForMouseUp = false;
  private linkInput: HTMLInputElement;
  private savedRange: Range;
  private mouseUpCounter: number = 0;
  private input: HTMLElement;
  // private log: ReturnType<typeof logger>;

  constructor() {
    // this.log = logger('MARKUP');
  }

  public static getInstance() {
    return this.INSTANCE ||= new MarkupTooltip();
  }

  private init() {
    this.container = document.createElement('div');
    this.container.classList.add('markup-tooltip', 'z-depth-1', 'hide');

    this.wrapper = document.createElement('div');
    this.wrapper.classList.add('markup-tooltip-wrapper');

    const tools1 = document.createElement('div');
    const tools2 = document.createElement('div');
    tools1.classList.add('markup-tooltip-tools', 'markup-tooltip-tools-regular');
    tools2.classList.add('markup-tooltip-tools', 'markup-tooltip-tools-link');

    const arr: Array<keyof MarkupTooltip['buttons'] | [keyof MarkupTooltip['buttons'], Icon]> = [
      'bold',
      'italic',
      'underline',
      'strikethrough',
      'monospace',
      'spoiler',
      ['quote', 'quote_outline'],
      'link'
    ];
    arr.forEach((c) => {
      const type = typeof(c) === 'string' ? c : c[0];
      const icon = typeof(c) === 'string' ? c : c[1];
      const button = ButtonIcon(icon, {noRipple: true});
      tools1.append(this.buttons[type] = button);

      if(c !== 'link') {
        button.addEventListener('mousedown', (e) => {
          cancelEvent(e);
          applyMarkdown(this.input, type);
          this.cancelClosening();

          /* this.mouseUpCounter = 0;
          this.setMouseUpEvent(); */
          // this.hide();
        });
      } else {
        attachClickEvent(button, (e) => {
          cancelEvent(e);
          this.showLinkEditor();
          this.cancelClosening();
        });
      }
    });

    this.linkBackButton = ButtonIcon('left', {noRipple: true});
    this.linkInput = document.createElement('input');
    _i18n(this.linkInput, 'MarkupTooltip.LinkPlaceholder', undefined, 'placeholder');
    this.linkInput.classList.add('input-clear');
    this.linkInput.addEventListener('keydown', (e) => {
      const valid = !this.linkInput.value.length || !!matchUrl(this.linkInput.value);// /^(http)|(https):\/\//i.test(this.linkInput.value);

      if(e.key === 'Enter') {
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

    this.linkBackButton.addEventListener('mousedown', (e) => {
      // this.log('linkBackButton click');
      cancelEvent(e);
      this.container.classList.remove('is-link');
      // input.value = '';
      this.resetSelection();
      this.setTooltipPosition();
      this.cancelClosening();
    });

    this.linkApplyButton = ButtonIcon('check markup-tooltip-link-apply', {noRipple: true});
    this.linkApplyButton.addEventListener('mousedown', (e) => {
      // this.log('linkApplyButton click');
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
    // tools1.insertBefore(delimiter2, this.buttons.link.nextSibling);

    this.wrapper.append(tools1, tools2);
    this.container.append(this.wrapper);
    document.body.append(this.container);

    window.addEventListener('resize', () => {
      this.hide();
    });
  }

  public showLinkEditor() {
    if(!this.container || !this.container.classList.contains('is-visible')) { // * if not inited yet (Ctrl+A + Ctrl+K)
      this.show();
    }

    const button = this.buttons.link;
    this.container.classList.add('is-link');

    const selection = document.getSelection();
    this.savedRange = selection.getRangeAt(0);

    const markup = getMarkupInSelection(['link']);
    const anchor = markup['link'].elements.find((element) => element.tagName === 'A') as HTMLAnchorElement;

    if(button.classList.contains('active')) {
      this.linkInput.value = anchor.href;
    } else {
      this.linkInput.value = '';
    }

    this.setTooltipPosition(true);

    setTimeout(() => {
      this.linkInput.focus(); // !!! instant focus will break animation
    }, 200);
    this.linkInput.classList.toggle('is-valid', this.isLinkValid());
  }

  private applyLink(e: Event) {
    cancelEvent(e);
    this.resetSelection();
    let url = this.linkInput.value;
    if(url && !matchUrlProtocol(url)) {
      url = 'https://' + url;
    }
    applyMarkdown(this.input, 'link', url);
    setTimeout(() => {
      this.hide();
    }, 0);
  }

  private isLinkValid() {
    return !this.linkInput.value.length || !!matchUrl(this.linkInput.value);
  }

  private resetSelection(range: Range = this.savedRange) {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    this.input.focus();
  }

  public hide() {
    // return;

    if(this.init) return;

    this.input = undefined;
    this.container.classList.remove('is-visible');
    // document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('mouseup', this.onMouseUpSingle);
    this.waitingForMouseUp = false;

    appNavigationController.removeByType('markup');

    if(this.hideTimeout) clearTimeout(this.hideTimeout);
    this.hideTimeout = window.setTimeout(() => {
      this.hideTimeout = undefined;
      this.container.classList.add('hide');
      this.container.classList.remove('is-link');
    }, 200);
  }

  public getActiveMarkupButton() {
    const currentMarkups: Set<HTMLElement> = new Set();

    // const nodes = getSelectedNodes();
    // const parents = [...new Set(nodes.map((node) => node.parentNode))];
    // // if(parents.length > 1 && parents) return [];

    // (parents as HTMLElement[]).forEach((node) => {
    //   for(const type in markdownTags) {
    //     const tag = markdownTags[type as TooltipTypes];
    //     const closest = node.closest(tag.match + ', [contenteditable="true"]');
    //     if(closest !== this.appImManager.chat.input.messageInput) {
    //       currentMarkups.add(this.buttons[type as TooltipTypes]);
    //     }
    //   }
    // });

    const types = Object.keys(this.buttons) as MarkupTooltipTypes[];
    const markup = getMarkupInSelection(types);
    types.forEach((type) => {
      if(markup[type].active) {
        currentMarkups.add(this.buttons[type as MarkupTooltipTypes]);
      }
    });

    return [...currentMarkups];
  }

  public setActiveMarkupButton() {
    const activeButtons = this.getActiveMarkupButton();

    for(const i in this.buttons) {
      // @ts-ignore
      const button = this.buttons[i];
      button.classList.toggle('active', activeButtons.includes(button));
    }
  }

  private setTooltipPosition(isLinkToggle = false) {
    const selection = document.getSelection();
    const range = selection.getRangeAt(0);

    const rowsWrapper = findUpClassName(this.input, 'rows-wrapper') ||
      findUpClassName(this.input, 'input-message-container') ||
      findUpClassName(this.input, 'input-field');
    const currentTools = this.container.classList.contains('is-link') ? this.wrapper.lastElementChild : this.wrapper.firstElementChild;
    const bodyRect = document.body.getBoundingClientRect();
    const selectionRect = range.getBoundingClientRect();
    const inputRect = rowsWrapper.getBoundingClientRect();
    const sizesRect = currentTools.getBoundingClientRect();

    this.container.style.maxWidth = inputRect.width + 'px';

    const visibleRect = getVisibleRect(
      undefined,
      this.input,
      false,
      selectionRect
    );

    const {newHeight = 0, oldHeight = newHeight} = this.input as any;

    if(!visibleRect) { // can be when modifying quote that's not in visible area
      return;
    }

    const selectionTop = (visibleRect ? visibleRect.rect.top : inputRect.top) /* selectionRect.top */ + (bodyRect.top * -1);

    const top = selectionTop - sizesRect.height - 8 + (true ? oldHeight - newHeight : 0);

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

    if(isSelectionEmpty()) {
      this.hide();
      return;
    }

    if(this.hideTimeout !== undefined) {
      clearTimeout(this.hideTimeout);
    }

    if(this.container.classList.contains('is-visible')) {
      return;
    }

    this.container.classList.toggle('night', overlayCounter.isDarkOverlayActive);

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

    if(!IS_MOBILE) {
      appNavigationController.pushItem({
        type: 'markup',
        onPop: () => {
          this.hide();
        }
      });
    }

    // this.log('selection', selectionRect, activeButton);
  }

  /* private onMouseUp = (e: Event) => {
    this.log('onMouseUp');
    if(findUpClassName(e.target, 'markup-tooltip')) return;

    this.hide();
    //document.removeEventListener('mouseup', this.onMouseUp);
  }; */

  private onMouseUpSingle = (e?: Event) => {
    // this.log('onMouseUpSingle');
    this.waitingForMouseUp = false;

    if(IS_TOUCH_SUPPORTED) {
      e && cancelEvent(e);
      if(this.mouseUpCounter++ === 0) {
        this.resetSelection(this.savedRange);
      } else {
        this.hide();
        return;
      }
    }

    this.show();

    /* !isTouchSupported && document.addEventListener('mouseup', this.onMouseUp); */
  };

  public setMouseUpEvent() {
    if(this.waitingForMouseUp) return;
    this.waitingForMouseUp = true;

    // this.log('setMouseUpEvent');

    document.addEventListener('mouseup', this.onMouseUpSingle, {once: true});
  }

  public cancelClosening() {
    if(IS_TOUCH_SUPPORTED && !IS_APPLE) {
      document.removeEventListener('mouseup', this.onMouseUpSingle);
      document.addEventListener('mouseup', (e) => {
        cancelEvent(e);
        this.mouseUpCounter = 1;
        this.waitingForMouseUp = false;
        this.setMouseUpEvent();
      }, {once: true});
    }
  }

  public canFormatInput(input: Element) {
    return input.classList.contains('input-message-input') || input.getAttribute('can-format');
  }

  public handleSelection() {
    if(this.addedListener) return;
    this.addedListener = true;
    document.addEventListener('selectionchange', (e) => {
      // this.log('selectionchange');

      if(document.activeElement === this.linkInput) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement;
      if(this.input ? activeElement !== this.input : !this.canFormatInput(activeElement)) {
        this.hide();
        return;
      }

      const selection = document.getSelection();
      if(isSelectionEmpty(selection)) {
        this.hide();
        return;
      }

      this.input = activeElement;

      if(IS_TOUCH_SUPPORTED) {
        if(IS_APPLE) {
          this.show();
          this.setTooltipPosition(); // * because can skip this in .show();
        } else {
          if(this.mouseUpCounter === 2) {
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
      } else if(this.container && this.container.classList.contains('is-visible')) {
        this.setActiveMarkupButton();
        this.setTooltipPosition();
      } else if(this.input.matches(':active')) {
        this.setMouseUpEvent();
      } else {
        this.show();
      }
    });

    document.addEventListener('beforeinput', (e) => {
      if(e.inputType === 'historyRedo' || e.inputType === 'historyUndo') {
        e.target.addEventListener('input', () => this.setActiveMarkupButton(), {once: true});
      }
    });
  }
}
