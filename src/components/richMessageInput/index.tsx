import {createSignal, onCleanup} from 'solid-js';
import InputFieldAnimated from '@components/inputFieldAnimated';
import type {InputFieldOptions} from '@components/inputField';
import ButtonIcon from '@components/buttonIcon';
import createChatInputEditor from '@components/chat/inputEditor';
import type {ChatInputEditor, ChatInputEditorOptions, ChatInputEditorSnapshot, CreateChatInputEditor} from '@components/chat/inputEditor/types';
import reloadChatInputEditor, {createChatInputEditorReloadScheduler} from '@components/chat/inputEditor/reload';
import {CHAT_INPUT_EDITOR_TEST_MEDIA_REQUEST_EVENT, CHAT_INPUT_EDITOR_TEST_MEDIA_URL, type ChatInputEditorTestMediaRequest} from '@components/chat/inputEditor/testData';
import type {RichMediaItemAction, RichMediaItemInsertAction} from '@components/chat/inputEditor/mediaPaste';
import MarkupTooltip from '@components/chat/markupTooltip';
import EditorToolbar, {type EditorToolbarOptions} from '@components/richMessageInput/toolbar';
import RichMediaUploads, {type RichMediaUploadServices} from '@components/richMessageInput/media';
import editRichMediaItem from '@components/richMessageInput/editMedia';
import type {AiEditorContext} from '@components/richMessageInput/aiContext';
import {useAiEditorButton} from '@components/richMessageInput/ai';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import cancelEvent from '@helpers/dom/cancelEvent';
import {handleMarkdownShortcut} from '@helpers/dom/markdown';
import isSendShortcutPressed, {isNewLineShortcutPressed} from '@helpers/dom/isSendShortcutPressed';
import findUpClassName from '@helpers/dom/findUpClassName';
import placeCaretAtEnd from '@helpers/dom/placeCaretAtEnd';
import ListenerSetter from '@helpers/listenerSetter';
import {getMiddleware} from '@helpers/middleware';
import mediaSizes from '@helpers/mediaSizes';
import windowSize from '@helpers/windowSize';
import {replaceButtonIcon} from '@components/button';
import I18n from '@lib/langPack';
import {toastNew} from '@components/toast';
import {QUOTE_COLLAPSE_TOGGLE_CLASS} from '@components/chat/inputEditor/extensions/quotes';
import './style.scss';

type Selection = ReturnType<ChatInputEditor['captureSelection']>;

export type RichMessageInputOptions = Pick<EditorToolbarOptions, 'canInsertMap' | 'getPremiumRequired' | 'subscribeCapabilities'> & {
  field?: InputFieldOptions,
  expandable?: boolean,
  /** Optional outer element whose height participates in the application's layout. */
  layoutElement?: HTMLElement,
  tabIndex?: number,
  captureContext?: () => () => boolean,
  media?: RichMediaUploadServices,
  ai?: AiEditorContext,
  isAiHidden?: () => boolean,
  onSubmit?: () => void,
  onInput?: (event: Event) => void,
  onHeightChange?: (height: number) => void,
  onExpandedChange?: (expanded: boolean) => void,
  onReadOnlyClick?: () => void,
  onChooseMedia?: (selection: Selection, action: RichMediaItemInsertAction) => void,
  ref?: (input: RichMessageInputController) => void
};

let createEditor: CreateChatInputEditor = createChatInputEditor;
const mountedInputs = new Set<RichMessageInputController>();
if(import.meta.hot) {
  import.meta.hot.accept('../chat/inputEditor', (module) => {
    if(!module) return;
    createEditor = (module as unknown as typeof import('../chat/inputEditor')).default;
    mountedInputs.forEach(input => input.reloadEditor(createEditor));
  });
}

export class RichMessageInputController {
  public readonly element: HTMLDivElement;
  public readonly row = document.createElement('div');
  public readonly content = document.createElement('div');
  public readonly field: InputFieldAnimated;
  public readonly input: HTMLElement;
  public readonly toolbar: EditorToolbar;
  public readonly media: RichMediaUploads;
  public editor: ChatInputEditor;
  public expanded: boolean;
  private readonly layout: HTMLElement;
  private readonly expandButton: HTMLButtonElement;
  private readonly listenerSetter = new ListenerSetter();
  private readonly middlewareHelper = getMiddleware();
  private readonly reloadScheduler: ReturnType<typeof createChatInputEditorReloadScheduler>;
  private resizeTimeout: number;
  private resizeWindow: Window;
  private resizeTransitionEnd: (event: TransitionEvent) => void;
  private destroyed = false;
  private refreshAiVisibility: VoidFunction;
  private accessoryNodes: Node[] = [];
  private readonly picker = document.createElement('input');
  private pendingFileSelection: {selection: Selection, action?: RichMediaItemInsertAction, isCurrent: () => boolean};

  constructor(private options: RichMessageInputOptions = {}) {
    this.row.className = 'new-message-wrapper rows-wrapper-row';
    this.content.className = 'input-message-container';
    if(options.layoutElement) {
      this.element = this.row;
      this.layout = options.layoutElement;
      this.layout.classList.add('rich-message-input');
    } else {
      this.element = document.createElement('div');
      this.element.className = 'rich-message-input rich-message-input-standalone';
      this.layout = this.element;
      this.element.append(this.row);
    }
    this.field = new InputFieldAnimated({placeholder: 'Message', name: 'message', withLinebreaks: true, ...options.field});
    this.input = this.field.input;
    this.input.tabIndex = options.tabIndex ?? 0;
    this.input.classList.replace('input-field-input', 'input-message-input');
    this.content.append(this.field.heightWrapper, this.field.placeholder);
    this.row.append(this.content);
    this.field.onChangeHeight = (height) => {
      this.row.classList.toggle('has-message-input-expand-button', !!this.expandButton && height >= 72);
      if(!options.layoutElement) this.layout.style.setProperty('--message-input-collapsed-height', Math.max(48, height + 8) + 'px');
      options.onHeightChange?.(height);
    };
    if(options.expandable !== false) {
      this.expandButton = ButtonIcon('fullscreen toggle-message-input-size', {noRipple: true});
      let restoreFocus = false;
      this.listenerSetter.add(this.expandButton)('mousedown', () => {
        restoreFocus = this.input.ownerDocument.activeElement === this.input;
      });
      attachClickEvent(this.expandButton, () => {
        this.setExpanded(!this.expanded, true);
        if(restoreFocus) this.editor.focus();
        restoreFocus = false;
      }, {listenerSetter: this.listenerSetter, cancelMouseDown: true});
    }
    this.editor = createEditor(this.input, this.editorOptions());
    this.toolbar = new EditorToolbar({
      getEditor: () => this.editor,
      expandButton: this.expandButton,
      captureContext: () => this.captureContext(),
      canInsertMap: options.canInsertMap,
      getPremiumRequired: options.getPremiumRequired,
      subscribeCapabilities: options.subscribeCapabilities,
      onAi: options.ai ? () => this.row.querySelector<HTMLButtonElement>('.chat-input-ai-editor-button')?.click() : undefined
    });
    this.mountAccessories([], []);
    if(options.media) this.media = new RichMediaUploads({
      getEditor: () => this.editor,
      isExpanded: () => this.expanded,
      services: {
        ...options.media,
        capture: () => {
          const session = options.media.capture();
          const isCurrent = this.captureContext();
          return {...session, isCurrent: () => isCurrent() && session.isCurrent()};
        }
      }
    });
    this.reloadScheduler = createChatInputEditorReloadScheduler(this.input, () => this.editor.isComposing);
    this.installListeners();
    this.picker.type = 'file';
    this.picker.hidden = true;
    this.row.append(this.picker);
    this.listenerSetter.add(this.picker)('change', () => {
      const pending = this.pendingFileSelection;
      const files = Array.from(this.picker.files || []);
      this.pendingFileSelection = undefined;
      this.picker.value = '';
      if(pending?.isCurrent() && files.length) void this.insertMedia(files, pending.selection, pending.action);
    });
    this.listenerSetter.add(this.picker)('cancel', () => {this.pendingFileSelection = undefined;});
    this.listenerSetter.add(mediaSizes)('resize', () => this.syncHeight());
    this.syncHeight();
    this.setExpanded(false);
    const [uiRevision, setUiRevision] = createSignal(0);
    this.refreshAiVisibility = () => setUiRevision(value => value + 1);
    if(options.ai) useAiEditorButton({
      context: options.ai,
      inputField: () => this.field,
      container: () => this.content,
      appendTo: () => this.row,
      canSend: true,
      forceHidden: () => {uiRevision(); return options.isAiHidden?.() ?? false;}
    });
    mountedInputs.add(this);
  }

  private captureContext() {
    const isCurrent = this.options.captureContext?.() || (() => true);
    return () => !this.destroyed && isCurrent();
  }

  private editorOptions(): ChatInputEditorOptions {
    return {
      enableBlockSelection: false,
      isNewLineShortcutPressed,
      onCodeBlockLanguagePicker: (element: HTMLElement) => this.toolbar?.openCodeLanguage(element),
      onLinkEditor: (selection: Selection) => void this.toolbar?.insertLink(selection),
      onStateChange: () => this.toolbar?.update(),
      onKeyDown: (event: KeyboardEvent) => {
        if(!this.options.onSubmit || !isSendShortcutPressed(event)) return false;
        cancelEvent(event);
        this.options.onSubmit();
        return true;
      }
    };
  }

  /** Chat-owned accessories occupy slots; the field owns the editor and toolbars. */
  public mountAccessories(before: Node[], after: Node[]) {
    this.accessoryNodes.forEach(node => node.parentNode === this.row && this.row.removeChild(node));
    this.accessoryNodes = [...before, ...after];
    this.row.prepend(...before);
    this.row.append(this.content, ...after);
    if(this.toolbar?.top) this.row.append(this.toolbar.top, this.toolbar.bottom);
  }

  public reloadEditor(create: CreateChatInputEditor, snapshot?: ChatInputEditorSnapshot) {
    this.reloadScheduler.run(() => {
      if(this.destroyed) return;
      MarkupTooltip.getInstance().hide();
      this.toolbar.close();
      this.editor = reloadChatInputEditor(this.editor, create, this.editorOptions(), snapshot || this.editor.snapshot());
      this.editor.setExpanded(!!this.expanded);
      this.media?.rebindEditor();
      this.field.syncFromInput();
      this.toolbar.update();
    });
  }

  public insertMedia(files: File[], selection: Selection, action?: RichMediaItemInsertAction) {
    return this.media?.insert(files, selection, action) || Promise.resolve(false);
  }

  public sync() {
    this.media?.reconcile();
    this.toolbar.update();
    this.refreshAiVisibility();
  }

  public cancelMedia() {this.media?.clear();}

  public showMap(selection?: Selection) {return this.toolbar.insertMap(selection);}

  public chooseMedia(selection = this.editor.captureSelection(), action?: RichMediaItemInsertAction, accept = 'image/*,video/*,audio/*') {
    if(!this.media) return;
    const editor = this.editor;
    const isCurrent = this.captureContext();
    this.pendingFileSelection = {selection, action, isCurrent: () => isCurrent() && this.editor === editor};
    this.picker.multiple = action?.action !== 'replace';
    this.picker.accept = accept;
    this.picker.value = '';
    this.picker.click();
  }

  public captureMediaTarget(event: ClipboardEvent | DragEvent) {
    if(!this.expanded) return;
    if('dataTransfer' in event && event.dataTransfer) {
      const rect = this.row.getBoundingClientRect();
      if(event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      return this.editor.captureSelectionAtPoint(event.clientX, event.clientY);
    }
    return this.editor.captureSelection();
  }

  public syncHeight() {
    const height = mediaSizes.isMobile ? 160 : windowSize.height <= 480 ? Math.max(36, windowSize.height - 32 - 160) : 440;
    this.field.setMaxHeight(height);
  }

  private installListeners() {
    this.listenerSetter.add(this.input)('input', (event) => {
      this.media?.reconcile();
      this.options.onInput?.(event);
    });
    this.listenerSetter.add(this.input)('chat-input-rich-media-upload-action', (event: Event) => {
      const {action, uploadId} = (event as CustomEvent<{action: 'remove' | 'retry', uploadId: string}>).detail;
      this.media?.handleAction(action, uploadId);
    });
    this.listenerSetter.add(this.input)('chat-input-rich-media-action', (event: Event) => {
      const action = (event as CustomEvent<RichMediaItemAction>).detail;
      if(!this.media || !Number.isInteger(action.activeIndex) || action.activeIndex < 0 ||
        !Number.isInteger(action.from) || !Number.isInteger(action.to) || action.from < 0 || action.to <= action.from) return;
      if(action.action === 'edit') {
        const editor = this.editor;
        const isCurrent = this.captureContext();
        void editRichMediaItem(action, {
          editor, middleware: this.middlewareHelper.get(),
          isCurrent: () => isCurrent() && this.editor === editor,
          insert: (files, selection, action) => this.insertMedia(files, selection, action)
        });
      } else {
        const selection: Selection = {...this.editor.captureSelection(), from: action.from, to: action.to, type: 'node'};
        if(this.options.onChooseMedia) this.options.onChooseMedia(selection, action);
        else this.chooseMedia(selection, action, 'image/*,video/*');
      }
    });
    this.listenerSetter.add(this.input)('keydown', (event) => {
      if(event.defaultPrevented) return;
      if(event.ctrlKey || event.metaKey) handleMarkdownShortcut(this.input, event);
      else if((event.key === 'PageUp' || event.key === 'PageDown') && !event.shiftKey) {
        event.preventDefault();
        if(event.key === 'PageDown') placeCaretAtEnd(this.input);
        else {
          const range = this.input.ownerDocument.createRange();
          range.setStart(this.input.firstChild || this.input, 0);
          range.collapse(true);
          const selection = this.input.ownerDocument.defaultView.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    });
    attachClickEvent(this.input, (event) => {
      if(!this.input.isContentEditable) {this.options.onReadOnlyClick?.(); return;}
      // the quote's fold switch, over its corner icon; Enter and Space press it too
      const toggle = findUpClassName(event.target, QUOTE_COLLAPSE_TOGGLE_CLASS);
      const quote = toggle?.parentElement;
      if(!quote) return;
      if(this.editor.toggleBlockquoteCollapsed(toggle)) toastNew({langPackKey: quote.dataset.collapsed ? 'Input.Quote.Collapsed' : 'Input.Quote.Expanded'});
    }, {listenerSetter: this.listenerSetter});
    if(import.meta.env.DEV || import.meta.env.VITE_PREVIEW) this.listenerSetter.add(this.input)(CHAT_INPUT_EDITOR_TEST_MEDIA_REQUEST_EVENT, (event: Event) => {
      (event as CustomEvent<ChatInputEditorTestMediaRequest>).detail.uploadMedia = () => this.uploadTestMedia();
    });
  }

  private async uploadTestMedia() {
    const editor = this.editor;
    const isCurrent = this.captureContext();
    const appWindow = this.input.ownerDocument.defaultView;
    try {
      const response = await appWindow.fetch(CHAT_INPUT_EDITOR_TEST_MEDIA_URL);
      if(!response.ok) return false;
      const blob = await response.blob();
      if(!isCurrent() || this.editor !== editor) return false;
      this.setExpanded(true);
      editor.focusAtEnd(false);
      if(!await this.insertMedia([new File([blob], 'camomile.jpg', {type: blob.type || 'image/jpeg'})], editor.captureSelection())) return false;
    } catch{return false;}
    return new Promise<boolean>((resolve) => {
      const finish = (result: boolean) => {appWindow.clearTimeout(timeout); this.input.removeEventListener('input', check); resolve(result);};
      const check = () => {
        if(!isCurrent() || this.editor !== editor) finish(false);
        else if(!editor.hasPendingRichMediaUploads()) finish(editor.getRichMessage({draft: true}).input.blocks.some(block => ['pageBlockPhoto', 'pageBlockVideo', 'pageBlockCollage', 'pageBlockSlideshow', 'pageBlockAudio'].includes(block._)));
      };
      const timeout = appWindow.setTimeout(() => finish(false), 60_000);
      this.input.addEventListener('input', check);
      queueMicrotask(check);
    });
  }

  private captureCollapsedRect(measureCollapsedHeight = false) {
    if(
      !this.row?.isConnected ||
      !this.content?.isConnected
    ) {
      return false;
    }

    const wasExpanded = this.layout.classList.contains('is-message-input-expanded');
    const inputScrollTop = this.input?.scrollTop;
    if(wasExpanded) {
      this.layout.classList.remove('is-message-input-expanded');
      this.row.classList.remove('is-expanded');
    }

    if(measureCollapsedHeight) {
      this.field?.setHeightMeasurementEnabled(true);
    }

    const wrapperRect = this.row.getBoundingClientRect();
    const inputRect = this.content.getBoundingClientRect();

    if(wasExpanded) {
      this.layout.classList.add('is-message-input-expanded');
      this.row.classList.add('is-expanded');
      if(inputScrollTop !== undefined) this.input.scrollTop = inputScrollTop;
    }
    if(measureCollapsedHeight) {
      this.field?.setHeightMeasurementEnabled(false);
    }

    if(!wrapperRect.width || !wrapperRect.height || !inputRect.width || !inputRect.height) {
      return false;
    }

    const setInset = (name: string, value: number) => {
      this.row.style.setProperty(name, `${Math.max(0, value)}px`);
    };
    setInset('--message-input-collapsed-top', inputRect.top - wrapperRect.top);
    setInset('--message-input-collapsed-right', wrapperRect.right - inputRect.right);
    setInset('--message-input-collapsed-bottom', wrapperRect.bottom - inputRect.bottom);
    setInset('--message-input-collapsed-left', inputRect.left - wrapperRect.left);
    return true;
  }

  private finishResize() {
    const wasResizing = this.layout?.classList.contains('is-message-input-resizing');
    if(this.resizeTimeout !== undefined) {
      this.resizeWindow?.clearTimeout(this.resizeTimeout);
      this.resizeTimeout = undefined;
      this.resizeWindow = undefined;
    }
    if(this.resizeTransitionEnd) {
      this.layout?.removeEventListener('transitionend', this.resizeTransitionEnd);
      this.resizeTransitionEnd = undefined;
    }

    this.layout?.classList.remove('is-message-input-resizing');
    this.row?.classList.remove('is-message-input-resizing');
    if(wasResizing && this.expanded === false) {
      this.field?.setHeightMeasurementEnabled(true);
    }
  }

  public setExpanded(expanded: boolean, animate = false) {
    if(!this.expandButton) return;
    if(this.expanded === expanded) {
      this.editor?.setExpanded(expanded);
      if(!animate) this.finishResize();
      if(!this.layout.classList.contains('is-message-input-resizing')) {
        this.field?.setHeightMeasurementEnabled(!expanded);
      }
      this.toolbar.history?.setAttribute('aria-hidden', expanded ? 'false' : 'true');
      this.toolbar.bottom?.setAttribute('aria-hidden', expanded ? 'false' : 'true');
      if(expanded) this.toolbar.update();
      return;
    }

    this.finishResize();

    const appWindow = this.layout.ownerDocument.defaultView;
    const animationEnabled = this.layout.ownerDocument.body.classList.contains('animation-level-2');
    let shouldAnimate = !!(
      animate &&
      typeof(this.expanded) === 'boolean' &&
      appWindow &&
      animationEnabled &&
      this.layout.isConnected &&
      this.layout.getBoundingClientRect().height
    );
    if(shouldAnimate) shouldAnimate = this.captureCollapsedRect(!expanded);

    if(shouldAnimate) {
      this.layout.classList.add('is-message-input-resizing');
      this.row.classList.add('is-message-input-resizing');
      this.layout.offsetHeight;

      this.resizeTransitionEnd = (event) => {
        if(event.target !== this.layout || event.propertyName !== 'height') return;
        this.finishResize();
      };
      this.layout.addEventListener('transitionend', this.resizeTransitionEnd);
    }

    this.expanded = expanded;
    this.layout.classList.toggle('is-message-input-expanded', expanded);
    this.row.classList.toggle('is-expanded', expanded);
    this.editor?.setExpanded(expanded);
    this.expandButton.classList.toggle('active', expanded);
    this.expandButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    this.toolbar.history?.setAttribute('aria-hidden', expanded ? 'false' : 'true');
    this.toolbar.bottom?.setAttribute('aria-hidden', expanded ? 'false' : 'true');

    const label = I18n.format(
      expanded ? 'Chat.Input.CollapseEditor' : 'Chat.Input.ExpandEditor',
      true
    );
    this.expandButton.setAttribute('aria-label', label);
    this.expandButton.title = label;
    replaceButtonIcon(this.expandButton, expanded ? 'smallscreen' : 'fullscreen');
    MarkupTooltip.getInstance().hide();

    if(expanded) {
      this.field?.setHeightMeasurementEnabled(false);
      this.toolbar.update();
    } else if(!shouldAnimate) {
      this.field?.setHeightMeasurementEnabled(true);
    }
    this.options.onExpandedChange?.(expanded);

    if(shouldAnimate) {
      this.resizeWindow = appWindow;
      this.resizeTimeout = appWindow.setTimeout(() => {
        this.finishResize();
      }, 400);
    }
  }

  public destroy() {
    if(this.destroyed) return;
    this.destroyed = true;
    this.pendingFileSelection = undefined;
    this.picker.value = '';
    mountedInputs.delete(this);
    this.finishResize();
    this.reloadScheduler.destroy();
    this.layout.classList.remove('is-message-input-expanded');
    if(this.options.layoutElement) this.layout.classList.remove('rich-message-input');
    this.row.classList.remove('is-expanded');
    this.media?.destroy();
    this.toolbar.destroy();
    this.editor.destroy();
    this.field.destroy();
    this.listenerSetter.removeAll();
    this.middlewareHelper.destroy();
  }
}

export default function RichMessageInput(props: RichMessageInputOptions) {
  const input = new RichMessageInputController(props);
  props.ref?.(input);
  onCleanup(() => input.destroy());
  return input.element;
}
