import ButtonIcon from '@components/buttonIcon';
import {bindActiveWindowListener, getAppWindow, getOverlayRoot} from '@helpers/appWindow';
import {replaceButtonIcon} from '@components/button';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import {IS_APPLE, IS_MOBILE} from '@environment/userAgent';
import appNavigationController from '@components/appNavigationController';
import I18n, {LangPackKey} from '@lib/langPack';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import isSelectionEmpty from '@helpers/dom/isSelectionEmpty';
import {getFormattedDateEntityByElement, MarkdownType} from '@helpers/dom/getRichElementValue';
import getVisibleRect from '@helpers/dom/getVisibleRect';
import clamp from '@helpers/number/clamp';
import getMarkupInSelection from '@helpers/dom/getMarkupInSelection';
import {applyMarkdown} from '@helpers/dom/markdown';
import findUpClassName from '@helpers/dom/findUpClassName';
import overlayCounter from '@helpers/overlayCounter';
import type showDatePickerPopup from '@components/popups/datePicker';
import {getChatInputEditor} from '@components/chat/inputEditor/registry';
import type {ChatInputEditorSelection} from '@components/chat/inputEditor/types';
import rootScope from '@lib/rootScope';
import generatePremiumIcon from '@components/generatePremiumIcon';
import openCreateLinkPopupForInput from '@components/popups/createLinkForInput';
import mountMarkupTooltipScrollable from '@components/chat/markupTooltipScrollable';
import {CHAT_INPUT_EDITOR_SELECTION_UPDATE_EVENT} from '@components/chat/inputEditor/events';
import contextMenuController from '@helpers/contextMenuController';
import createAiEditorIcon from '@components/chat/createAiEditorIcon';
import tooltipController from '@helpers/tooltipController';
import captureInputContent from '@components/chat/inputEditor/captureInputContent';
import {FOCUS_TRAP_ATTACHED_ATTRIBUTE} from '@helpers/dom/focusTrap';

export type MarkupTooltipTypes = Extract<
  MarkdownType,
  'bold' | 'italic' | 'underline' | 'strikethrough' | 'monospace' |
  'spoiler' | 'quote' | 'link' | 'date' | 'highlight' | 'subscript' |
  'superscript'
>;

const RICH_ONLY_MARKUP_TYPES = new Set<MarkupTooltipTypes>(['highlight', 'subscript', 'superscript']);

export default class MarkupTooltip {
  private static INSTANCE: MarkupTooltip;
  public static DISPLAY_MARKUP_PARTLY = false;

  public container: HTMLElement;
  private wrapper: HTMLElement;
  private scrollContainer: HTMLDivElement;
  private buttons: {[type in MarkupTooltipTypes]: HTMLElement} = {} as any;
  private buttonIcons: Partial<{[type in MarkupTooltipTypes]: {inactive: Icon, active: Icon}}> = {};
  private dateLinkDelimiter: HTMLElement;
  private extendedDelimiter: HTMLElement;
  private aiButton: HTMLElement;
  private aiDelimiter: HTMLElement;
  private hideTimeout: number;
  private addedListener = false;
  private mouseSelectionActive = false;
  private waitingForMouseUp = false;
  private selectionChangeQueued = false;
  private savedEditorSelection: ChatInputEditorSelection;
  private mouseUpCounter: number = 0;
  private input: HTMLElement;
  // private log: ReturnType<typeof logger>;

  private onMenuToggle = (open: boolean) => {
    if(open) tooltipController.closeAll();
  };

  private onDocumentMouseDown = (event: MouseEvent) => {
    const target = event.target as Element;
    if(event.button !== 0 || !target?.closest) return;
    const input = target.closest<HTMLElement>('.input-message-input, [can-format]');
    this.mouseSelectionActive = !!input && this.canFormatInput(input);
  };

  private onDocumentMouseUp = () => {
    this.mouseSelectionActive = false;
  };

  public static showDatePickerPopup: typeof showDatePickerPopup;

  constructor() {
    // this.log = logger('MARKUP');
  }

  public static getInstance() {
    return this.INSTANCE ||= new MarkupTooltip();
  }

  private init() {
    tooltipController.register(() => this.hide());
    contextMenuController.addEventListener('toggle', this.onMenuToggle);

    this.container = document.createElement('div');
    this.container.classList.add('markup-tooltip', 'z-depth-1', 'hide');
    // it formats a field that may sit in a popup, whose focus trap must let the keyboard in here
    this.container.setAttribute(FOCUS_TRAP_ATTACHED_ATTRIBUTE, '');

    this.wrapper = document.createElement('div');
    this.wrapper.classList.add('markup-tooltip-wrapper');

    const row = document.createElement('div');
    row.classList.add('markup-tooltip-row');
    mountMarkupTooltipScrollable({
      mount: this.wrapper,
      row,
      onRef: (element) => this.scrollContainer = element
    });

    const arr: Array<keyof MarkupTooltip['buttons'] | [keyof MarkupTooltip['buttons'], Icon] | [keyof MarkupTooltip['buttons'], Icon, Icon]> = [
      'bold',
      'italic',
      'underline',
      'strikethrough',
      ['quote', 'blockquote'],
      ['date', 'calendar'],
      'link',
      'monospace',
      'spoiler',
      ['highlight', 'highlights'],
      ['subscript', 'text'],
      ['superscript', 'text']
    ];
    const textLabels: Partial<Record<MarkupTooltipTypes, string>> = {
      monospace: 'Aa',
      subscript: 'x₂',
      superscript: 'x²'
    };
    const labels: Record<MarkupTooltipTypes, LangPackKey> = {
      bold: 'KeyboardShortcuts.Action.Bold',
      italic: 'KeyboardShortcuts.Action.Italic',
      underline: 'KeyboardShortcuts.Action.Underline',
      strikethrough: 'KeyboardShortcuts.Action.Strikethrough',
      quote: 'Quote',
      date: 'AddDate',
      link: 'KeyboardShortcuts.Action.Link',
      monospace: 'KeyboardShortcuts.Action.Monospace',
      spoiler: 'KeyboardShortcuts.Action.Spoiler',
      highlight: 'Chat.Input.Editor.Format.Highlight',
      subscript: 'Chat.Input.Editor.Format.Subscript',
      superscript: 'Chat.Input.Editor.Format.Superscript'
    };
    const premiumIndicators: HTMLElement[] = [];
    arr.forEach((c) => {
      const type = typeof(c) === 'string' ? c : c[0];
      const inactiveIcon = (typeof(c) === 'string' ? c : c[1]) as Icon;
      const activeIcon = typeof(c) === 'string' ? undefined : c[2];
      if(activeIcon !== undefined && activeIcon !== inactiveIcon) {
        this.buttonIcons[type] = {inactive: inactiveIcon, active: activeIcon};
      }
      const textLabel = textLabels[type];
      const button = ButtonIcon(textLabel ? undefined : inactiveIcon, {noRipple: true});
      button.setAttribute('type', 'button');
      if(type !== 'link' && type !== 'date') button.setAttribute('aria-pressed', 'false');
      if(textLabel) {
        const icon = document.createElement('span');
        icon.classList.add('button-icon', type === 'monospace' ? 'markup-tooltip-monospace-icon' : 'markup-tooltip-script-icon');
        icon.textContent = textLabel;
        button.append(icon);
      }
      this.buttons[type] = button;
      if(RICH_ONLY_MARKUP_TYPES.has(type)) {
        const indicator = generatePremiumIcon();
        indicator.classList.add('message-input-editor-premium-star');
        indicator.hidden = true;
        premiumIndicators.push(indicator);
        button.append(indicator);
      }

      if(type === 'link') {
        attachClickEvent(button, (e) => {
          cancelEvent(e);
          const {input} = this;
          void openCreateLinkPopupForInput(input);
          this.hide();
        });
      } else if(type === 'date') {
        attachClickEvent(button, (e) => {
          cancelEvent(e);
          this.showDatePicker();
        });
      } else {
        const apply = (restoreSelection = false) => {
          if(!this.input?.isConnected || restoreSelection && !this.resetSelection()) return;
          applyMarkdown({input: this.input, type});
          // Applying advanced the document, so the selection saved before it is
          // stale. Without re-saving, a second markup applied from the keyboard
          // (where the button has the focus and the selection has to be restored)
          // is dropped by the revision check.
          this.saveRange();
          this.cancelClosening();
        };
        button.addEventListener('mousedown', (e) => {
          if(e.button !== 0) return;
          cancelEvent(e);
          apply();

          /* this.mouseUpCounter = 0;
          this.setMouseUpEvent(); */
          // this.hide();
        });
        button.addEventListener('click', (event) => {
          if(event.detail !== 0) return;
          cancelEvent(event);
          apply(true);
        });
      }
    });

    this.aiButton = ButtonIcon(undefined, {noRipple: true});
    this.aiButton.classList.add('markup-tooltip-ai');
    this.aiButton.append(createAiEditorIcon());
    const updateLabels = () => {
      const setLabel = (button: HTMLElement, key: LangPackKey) => {
        const label = I18n.format(key, true);
        button.setAttribute('aria-label', label);
        button.title = label;
      };
      for(const type in labels) setLabel(this.buttons[type as MarkupTooltipTypes], labels[type as MarkupTooltipTypes]);
      setLabel(this.aiButton, 'Chat.Input.Editor.Toolbar.AI');
    };
    updateLabels();
    rootScope.addEventListener('language_apply', updateLabels);
    attachClickEvent(this.aiButton, (event) => {
      cancelEvent(event);
      const wrapper = findUpClassName(this.input, 'new-message-wrapper');
      const editorButton = wrapper?.querySelector<HTMLElement>(
        '.chat-input-ai-editor-button'
      );
      if(editorButton) editorButton.click();
      else this.input?.focus();
      this.hide();
    });

    this.aiDelimiter = document.createElement('span');
    this.dateLinkDelimiter = document.createElement('span');
    this.extendedDelimiter = document.createElement('span');
    this.aiDelimiter.classList.add('markup-tooltip-delimiter');
    this.dateLinkDelimiter.classList.add('markup-tooltip-delimiter');
    this.extendedDelimiter.classList.add('markup-tooltip-delimiter');
    row.append(
      this.aiButton,
      this.aiDelimiter,
      this.buttons.bold,
      this.buttons.italic,
      this.buttons.underline,
      this.buttons.strikethrough,
      this.buttons.quote,
      this.dateLinkDelimiter,
      this.buttons.date,
      this.buttons.link,
      this.extendedDelimiter,
      this.buttons.monospace,
      this.buttons.spoiler,
      this.buttons.highlight,
      this.buttons.subscript,
      this.buttons.superscript
    );
    let premiumIndicatorGeneration = 0;
    const updatePremiumIndicators = async() => {
      const generation = ++premiumIndicatorGeneration;
      try {
        const state = await rootScope.managers.appMessagesManager.getRichMessagePostingState();
        if(generation !== premiumIndicatorGeneration) return;
        const visible = state.mode === 'premium' && !state.allowed;
        premiumIndicators.forEach((indicator) => indicator.hidden = !visible);
      } catch{
        if(generation !== premiumIndicatorGeneration) return;
        premiumIndicators.forEach((indicator) => indicator.hidden = true);
      }
    };
    rootScope.addEventListener('premium_toggle', updatePremiumIndicators);
    queueMicrotask(() => void updatePremiumIndicators());

    this.container.append(this.wrapper);
    getOverlayRoot().append(this.container);

    window.addEventListener('resize', () => {
      this.hide();
    });
  }

  public showDatePicker() {
    this.saveRange();
    const {input} = this;
    const editorSelection = this.savedEditorSelection;
    const contentIsCurrent = captureInputContent(input, getChatInputEditor(input));
    const markup = getMarkupInSelection(['date']);
    const element = markup.date.elements[0];
    let initDate = new Date();
    if(element) {
      const entity = getFormattedDateEntityByElement(element, 0, 0);
      initDate = new Date(entity.date * 1000);
    }
    MarkupTooltip.showDatePickerPopup({
      initDate,
      withTime: true,
      onPick: (timestamp: number) => {
        setTimeout(() => {
          if(!input.isConnected || !contentIsCurrent(getChatInputEditor(input))) return;
          if(!this.resetSelection(input, editorSelection)) return;

          // if(!timestamp) {
          //   ENTITY_ELEMENT_MAP.delete(element);
          // }

          applyMarkdown({
            input,
            type: 'date',
            dateSuffix: timestamp ? '' + timestamp : undefined
          });
        }, 0);
      },
      btnConfirmLangKey: element ? 'EditDate' : 'AddDate',
      btnDangerLangKey: element ? 'RemoveDate' : undefined
    });
  }

  private resetSelection(
    input: HTMLElement = this.input,
    editorSelection: ChatInputEditorSelection = this.savedEditorSelection
  ) {
    if(!input?.isConnected || !editorSelection) return false;
    const editor = getChatInputEditor(input);
    if(!editor) return false;
    if(editorSelection.revision !== undefined &&
      editorSelection.revision !== editor.captureSelection().revision) return false;

    editor.restoreSelection(editorSelection);
    return true;
  }

  private saveRange() {
    const input = this.input || getAppWindow().document.activeElement as HTMLElement;
    const editor = input && getChatInputEditor(input);
    if(!editor) return;

    this.input = input;
    this.savedEditorSelection = editor.captureSelection();
  }

  public hide() {
    // return;

    this.input = undefined;
    this.savedEditorSelection = undefined;
    if(this.init) return;
    this.container.classList.remove('is-visible');
    // document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('mouseup', this.onMouseUpSingle);
    this.waitingForMouseUp = false;

    appNavigationController.removeByType('markup');

    if(this.hideTimeout) clearTimeout(this.hideTimeout);
    this.hideTimeout = window.setTimeout(() => {
      this.hideTimeout = undefined;
      this.scrollContainer.scrollLeft = 0;
      this.container.classList.add('hide');
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
    const editor = this.input && getChatInputEditor(this.input);
    types.forEach((type) => {
      const state = editor?.getMarkupState(type);
      if(MarkupTooltip.DISPLAY_MARKUP_PARTLY ? state?.partly : state?.fully) {
        currentMarkups.add(this.buttons[type]);
      }
    });

    return [...currentMarkups];
  }

  public setActiveMarkupButton() {
    const activeButtons = this.getActiveMarkupButton();

    for(const i in this.buttons) {
      const type = i as MarkupTooltipTypes;
      const button = this.buttons[type];
      const isActive = activeButtons.includes(button);
      const wasActive = button.classList.contains('active');
      button.classList.toggle('active', isActive);
      if(type !== 'link' && type !== 'date') button.setAttribute('aria-pressed', `${isActive}`);

      const icons = this.buttonIcons[type];
      if(icons && wasActive !== isActive) {
        replaceButtonIcon(button, isActive ? icons.active : icons.inactive);
      }
    }
  }

  private setTooltipPosition() {
    const selection = document.getSelection();
    if(!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);

    const rowsWrapper = findUpClassName(this.input, 'simple-message-input-container') ||
      findUpClassName(this.input, 'rows-wrapper') ||
      findUpClassName(this.input, 'input-message-container') ||
      findUpClassName(this.input, 'input-field') ||
      this.input?.closest('[data-markup-tooltip-host]');

    if(!rowsWrapper) return;

    const bodyRect = getOverlayRoot().getBoundingClientRect();
    const selectionRect = range.getBoundingClientRect();
    const inputRect = rowsWrapper.getBoundingClientRect();
    const sizesRect = this.scrollContainer.getBoundingClientRect();

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
    const x = selectionRect.left + (selectionRect.width - sizesRect.width) / 2;
    const left = clamp(x, minX, maxX);

    this.container.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }

  private hasFormattableSelection(input = this.input) {
    const editor = input && getChatInputEditor(input);
    if(!editor) return false;

    const selection = editor.captureSelection();
    return (!selection.type || selection.type === 'all') &&
      selection.from !== selection.to &&
      !!editor.getSelectedText().trim();
  }

  public show() {
    if(!this.input || !this.canFormatInput(this.input) || contextMenuController.isOpened()) {
      this.hide();
      return;
    }

    if(this.init) {
      this.init();
      this.init = null;
    }

    if(!this.hasFormattableSelection()) {
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

    const canFormat = this.input.getAttribute('can-format');
    const allowedTypes = canFormat !== null ?
      new Set(canFormat.split(',').filter(Boolean) as MarkupTooltipTypes[]) :
      null;
    const hiddenTypes = new Set<MarkupTooltipTypes>();
    const editor = getChatInputEditor(this.input);
    (Object.keys(this.buttons) as MarkupTooltipTypes[]).forEach((type) => {
      // What the mounted schema cannot apply must not be offered: a plain field
      // carries no highlight or script marks.
      const hidden = !!allowedTypes && !allowedTypes.has(type) || !editor?.supportsMarkup(type);
      this.buttons[type].classList.toggle('hide', hidden);
      if(hidden) hiddenTypes.add(type);
    });
    const hasBasicFormatting = ([
      'bold',
      'italic',
      'underline',
      'strikethrough',
      'quote'
    ] as const).some((type) => !hiddenTypes.has(type));
    const hasDateOrLink = (['date', 'link'] as const)
    .some((type) => !hiddenTypes.has(type));
    const hasExtendedFormatting = ([
      'monospace',
      'spoiler',
      'highlight',
      'subscript',
      'superscript'
    ] as const).some((type) => !hiddenTypes.has(type));

    const aiAvailable = this.input.classList.contains('input-message-input');
    this.aiButton.classList.toggle('hide', !aiAvailable);
    this.aiDelimiter.classList.toggle(
      'hide',
      !aiAvailable || !(hasBasicFormatting || hasDateOrLink || hasExtendedFormatting)
    );
    this.dateLinkDelimiter.classList.toggle(
      'hide',
      !hasBasicFormatting || !hasDateOrLink
    );
    this.extendedDelimiter.classList.toggle(
      'hide',
      !hasExtendedFormatting || !(aiAvailable || hasBasicFormatting || hasDateOrLink)
    );

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
        this.resetSelection();
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

    // Active window's document so text-selection formatting still works in a Document PiP window.
    getAppWindow().document.addEventListener('mouseup', this.onMouseUpSingle, {once: true});
  }

  public cancelClosening() {
    if(IS_TOUCH_SUPPORTED && !IS_APPLE) {
      getAppWindow().document.removeEventListener('mouseup', this.onMouseUpSingle);
      getAppWindow().document.addEventListener('mouseup', (e) => {
        cancelEvent(e);
        this.mouseUpCounter = 1;
        this.waitingForMouseUp = false;
        this.setMouseUpEvent();
      }, {once: true});
    }
  }

  public canFormatInput(input: Element) {
    if(!input) return false;
    const canFormat = input.getAttribute('can-format');
    return canFormat !== null ? !!canFormat.trim() : input.classList.contains('input-message-input');
  }

  private handleSelectionChange = (event?: Event) => {
    if(this.selectionChangeQueued) return;
    const editorSelectionCommitted =
      event?.type === CHAT_INPUT_EDITOR_SELECTION_UPDATE_EVENT;
    this.selectionChangeQueued = true;
    queueMicrotask(() => {
      this.selectionChangeQueued = false;
      const doc = getAppWindow().document;
      // ProseMirror commits its TextSelection from the same native
      // selectionchange event. Read it after every listener for that event has
      // run, otherwise a mouse drag is checked against the previous cursor.
      const activeElement = doc.activeElement as HTMLElement;
      if(this.input?.isConnected && this.container?.contains(activeElement)) return;
      if(this.input ? activeElement !== this.input : !this.canFormatInput(activeElement)) {
        this.hide();
        return;
      }

      const selection = doc.getSelection();
      if(!editorSelectionCommitted && isSelectionEmpty(selection)) {
        this.hide();
        return;
      }

      this.input = activeElement;
      if(!this.hasFormattableSelection(activeElement)) {
        this.hide();
        return;
      }

      this.saveRange();
      if(IS_TOUCH_SUPPORTED) {
        if(IS_APPLE) {
          this.show();
          this.setTooltipPosition(); // * because can skip this in .show();
        } else {
          if(this.mouseUpCounter === 2) {
            this.mouseUpCounter = 0;
            return;
          }

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
      } else if(this.mouseSelectionActive || this.input.matches(':active')) {
        this.setMouseUpEvent();
      } else {
        this.show();
      }
    });
  };

  public handleSelection() {
    if(this.addedListener) return;
    this.addedListener = true;
    // selectionchange/beforeinput are document-level — follow the active window so text-selection
    // formatting works in a Document PiP window (the events fire on the PiP document there).
    bindActiveWindowListener(
      (w) => w.document,
      'selectionchange',
      this.handleSelectionChange
    );
    bindActiveWindowListener(
      (w) => w.document,
      CHAT_INPUT_EDITOR_SELECTION_UPDATE_EVENT,
      this.handleSelectionChange
    );
    bindActiveWindowListener(
      (w) => w.document,
      'mousedown',
      this.onDocumentMouseDown,
      {capture: true}
    );
    bindActiveWindowListener(
      (w) => w.document,
      'mouseup',
      this.onDocumentMouseUp,
      {capture: true}
    );

    bindActiveWindowListener((w) => w.document, 'beforeinput', (e) => {
      if(e.inputType === 'historyRedo' || e.inputType === 'historyUndo') {
        e.target.addEventListener('input', () => this.setActiveMarkupButton(), {once: true});
      }
    });

    // ProseMirror applies history transactions without a native beforeinput event,
    // but the chat editor emits input after its state has been committed.
    bindActiveWindowListener((w) => w.document, 'input', (e) => {
      const input = e.target as HTMLElement;
      if(input === this.input && getChatInputEditor(input)) {
        this.setActiveMarkupButton();
      }
    });
  }
}
