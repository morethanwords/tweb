import {ButtonMenuItemOptions, ButtonMenuSync} from '@components/buttonMenu';
import {createButtonMenuSelect} from '@components/buttonMenuSelect';
import {toastNew} from '@components/toast';
import ButtonIcon from '@components/buttonIcon';
import CheckboxField from '@components/checkboxField';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import createSubmenuTrigger from '@components/createSubmenuTrigger';
import confirmationPopup from '@components/confirmationPopup';
import ListenerSetter from '@helpers/listenerSetter';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import InputField from '@components/inputField';
import Icon from '@components/icon';
import createAiEditorIcon from '@components/chat/createAiEditorIcon';
import {createRoot} from 'solid-js';
import {openCreateLinkPopupForEditor} from '@components/popups/createLinkForInput';
import {getMiddleware} from '@helpers/middleware';
import {ChatInputEditor} from '@components/chat/inputEditor';
import {isDecimalOrderedListType} from '@lib/richTextProcessor/orderedList';
import {CodeLanguageAliases, CodeLanguageMap} from '@/codeLanguages';
import {renderLatexInto} from '@components/instantViewMath';
import generatePremiumIcon from '@components/generatePremiumIcon';
import captureInputContent from '@components/chat/inputEditor/captureInputContent';
import preserveEditorSelectionOnToolbarButton from '@components/chat/inputEditor/toolbarButton';
import showRichMessageLocationPicker from '@components/popups/richMessageLocation';

type MessageInputCodeLanguageOption = {
  custom?: boolean,
  label: string,
  searchText: string,
  value: string
};
const MESSAGE_INPUT_MATH_SAMPLES = [
  'e^{i\\pi}=-1',
  'x^n+y^n=z^n',
  '\\sin^2\\alpha+\\cos^2\\alpha=1',
  'x_{1,2}=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}'
];

export type EditorToolbarOptions = {
  getEditor: () => ChatInputEditor,
  expandButton?: HTMLButtonElement,
  captureContext: () => () => boolean,
  canInsertMap?: () => Promise<boolean>,
  getPremiumRequired?: () => Promise<boolean>,
  subscribeCapabilities?: (update: () => void) => () => void,
  onAi?: () => void
};

export default class EditorToolbar {
  public top: HTMLDivElement;
  public bottom: HTMLDivElement;
  public history: HTMLDivElement;
  private undoButton: HTMLButtonElement;
  private redoButton: HTMLButtonElement;
  private tableButton: HTMLButtonElement;
  private languageElement: HTMLElement;
  private languageMenu: {close: () => void, open: (element: HTMLElement) => Promise<void>};
  private listenerSetter = new ListenerSetter();
  private middlewareHelper = getMiddleware();
  private destroyed = false;

  constructor(private options: EditorToolbarOptions) {this.construct();}
  private get editor() {return this.options.getEditor();}
  private get expandButton() {return this.options.expandButton;}

  private captureContext(editor: ChatInputEditor) {
    const contextIsCurrent = this.options.captureContext();
    const contentIsCurrent = captureInputContent(editor.input, editor);
    return () => !this.destroyed && editor.input.isConnected && contextIsCurrent() && contentIsCurrent(this.editor);
  }

  public openCodeLanguage(element: HTMLElement) {
    if(this.editor?.getCodeBlockLanguage(element) === undefined) return;
    this.languageElement = element;
    void this.languageMenu?.open(element);
  }

  public close() {
    this.languageMenu?.close();
    this.languageElement = undefined;
  }

  public destroy() {
    this.destroyed = true;
    this.close();
    this.listenerSetter.removeAll();
    this.middlewareHelper.destroy();
    this.top?.remove();
    this.bottom?.remove();
  }

  private createButton(icon: Icon | undefined, labelKey: LangPackKey, className = '') {
    const button = ButtonIcon(icon, {noRipple: true});
    button.tabIndex = -1;
    button.classList.add('message-input-editor-toolbar-button');
    if(className) button.classList.add(...className.split(' '));
    preserveEditorSelectionOnToolbarButton(button);
    const label = I18n.format(labelKey, true);
    button.setAttribute('aria-label', label);
    button.title = label;
    return button;
  }

  public update() {
    const editor = this.editor;
    if(!editor) return;
    if(this.undoButton) this.undoButton.disabled = !editor.canUndo();
    if(this.redoButton) this.redoButton.disabled = !editor.canRedo();
    if(this.tableButton) {
      this.tableButton.disabled = !editor.canInsertTable();
    }
  }

  public run(command: (editor: ChatInputEditor) => boolean) {
    if(!this.editor) return false;
    const result = command(this.editor);
    this.update();
    return result;
  }

  public async insertMath(
    block?: boolean,
    selection?: ReturnType<ChatInputEditor['captureSelection']>
  ) {
    const editor = this.editor;
    if(!editor) return;

    selection ||= editor.captureSelection();
    editor.restoreSelection(selection, false);
    const isCurrent = this.captureContext(editor);
    const selectedMath = editor.getSelectedMath();
    const canSeparateLine = editor.canUseSeparateLineMath();
    block ??= selectedMath?.block ?? false;
    if(!canSeparateLine) block = !!selectedMath?.block;
    const inputField = new InputField({
      label: 'Chat.Input.Editor.Math.Latex',
      placeholder: 'Chat.Input.Editor.Math.Sample',
      plainText: true,
      required: true,
      withLinebreaks: true
    });
    const initialSource = selectedMath ?
      selectedMath.source :
      editor.getSelectedText().trim();
    if(initialSource) inputField.setValueSilently(initialSource);
    const mathSample = MESSAGE_INPUT_MATH_SAMPLES[
      Math.floor(Math.random() * MESSAGE_INPUT_MATH_SAMPLES.length)
    ];
    if(!initialSource && inputField.placeholder) {
      inputField.placeholder.replaceChildren(mathSample);
    }
    const separateLineField = new CheckboxField({checked: block});
    const separateLine = document.createElement('label');
    separateLine.classList.add('popup-rich-math-separate-line');
    separateLine.append(
      i18n('Chat.Input.Editor.Math.SeparateLine'),
      separateLineField.label
    );
    separateLine.hidden = !canSeparateLine;

    const previewSection = document.createElement('div');
    previewSection.classList.add('popup-rich-math-preview-section');
    const previewLabel = document.createElement('div');
    previewLabel.classList.add('popup-rich-math-preview-label');
    previewLabel.textContent = I18n.format('Chat.Input.Editor.Math.Result', true);
    const preview = document.createElement('div');
    preview.classList.add('popup-rich-math-preview');
    previewSection.append(previewLabel, preview);
    const renderPreview = () => {
      const source = inputField.value.trim();
      const content = document.createElement('div');
      content.classList.add('popup-rich-math-preview-content');
      preview.replaceChildren(content);
      content.classList.toggle('is-empty', !source);
      renderLatexInto(content, source || mathSample, separateLineField.checked);
    };
    inputField.input.addEventListener('input', renderPreview);
    separateLineField.input.addEventListener('change', renderPreview);
    renderPreview();

    try {
      await confirmationPopup({
        titleLangKey: selectedMath ?
          'Chat.Input.Editor.Math.EditTitle' :
          'Chat.Input.Editor.Math.Title',
        inputField,
        content: [separateLine, previewSection],
        button: {langKey: selectedMath ? 'Save' : 'Create'},
        className: 'popup-rich-math'
      });
    } catch{
      return;
    } finally {
      inputField.input.removeEventListener('input', renderPreview);
      separateLineField.input.removeEventListener('change', renderPreview);
    }

    if(!isCurrent()) return;
    const source = inputField.value.replace(/\r?\n/g, ' ').trim();
    if(!source) return;
    editor.restoreSelection(selection, false);
    const inserted = separateLineField.checked ?
      editor.insertBlockMath(source) :
      editor.insertInlineMath(source);
    if(!inserted) toastNew({langPackKey: 'RichMessage.Error.UnsupportedContent'});
    this.update();
  }

  public async insertLink(
    selection?: ReturnType<ChatInputEditor['captureSelection']>
  ) {
    const editor = this.editor;
    if(!editor) return;

    const applied = await openCreateLinkPopupForEditor(editor, selection, this.captureContext(editor));
    if(!applied) return;
    this.update();
  }

  private async editCodeLanguage(element?: HTMLElement) {
    const editor = this.editor;
    if(!editor) return;
    element ||= this.languageElement;
    const isCurrent = this.captureContext(editor);
    const current = editor.getCodeBlockLanguage(element);
    if(current === undefined) return;

    const inputField = new InputField({
      label: 'Chat.Input.Editor.CodeLanguage.Custom',
      maxLength: 32,
      plainText: true,
      required: true,
      validate: () => /^[a-z\d+-]+$/i.test(inputField.value),
      withLinebreaks: false
    });
    if(current && !CodeLanguageAliases[current.toLowerCase()]) {
      inputField.setValueSilently(current);
    }

    try {
      await confirmationPopup({
        titleLangKey: 'Chat.Input.Editor.CodeLanguage.CustomTitle',
        inputField,
        button: {langKey: 'Save'}
      });
    } catch{
      return;
    }

    if(!isCurrent()) return;
    editor.setCodeBlockLanguage(inputField.value.trim(), element);
    this.update();
  }

  /** Desktop's "Add Button": one inside the text, or a row of its own with "Separate Line Button". */
  public async insertRichButton(
    selection?: ReturnType<ChatInputEditor['captureSelection']>
  ) {
    const editor = this.editor;
    if(!editor) return;
    const isCurrent = this.captureContext(editor);
    selection ||= editor.captureSelection();
    const {default: showRichButtonPopup} = await import('@components/popups/richButton');
    let result: Awaited<ReturnType<typeof showRichButtonPopup>>;
    try {
      result = await showRichButtonPopup({canChooseLine: true, separateLine: true});
    } catch{
      return;
    }

    if(!isCurrent() || 'delete' in result) return;
    editor.restoreSelection(selection, false);
    const {button, separateLine} = result;
    this.run((editor) => editor.insertRichButton({...button, separateLine}));
  }

  public async insertMap(
    selection?: ReturnType<ChatInputEditor['captureSelection']>
  ) {
    const editor = this.editor;
    if(!editor) return;
    const isCurrent = this.captureContext(editor);
    if(!await this.options.canInsertMap?.() || !isCurrent()) return;
    selection ||= editor.captureSelection();
    editor.restoreSelection(selection, false);
    const selected = editor.getSelectedMap();
    let options: Awaited<ReturnType<typeof showRichMessageLocationPicker>>;
    try {
      options = await showRichMessageLocationPicker({
        editing: !!selected,
        map: selected
      });
    } catch{
      return;
    }

    editor.restoreSelection(selection, false);
    if(!isCurrent()) return;
    if(selected) editor.updateSelectedMap(options);
    else editor.insertMap(options);
    this.update();
  }

  private construct() {
    if(!this.expandButton) return;

    const premiumIndicators = new Set<HTMLElement>();
    let premiumIndicatorGeneration = 0;
    const createPremiumIndicator = () => {
      const indicator = generatePremiumIcon();
      indicator.classList.add('message-input-editor-premium-star');
      indicator.hidden = true;
      premiumIndicators.add(indicator);
      return indicator;
    };
    const createPremiumLabel = (key: LangPackKey) => {
      const label = i18n(key);
      label.append(createPremiumIndicator());
      return label;
    };
    const withPremiumIndicator = (
      options: ButtonMenuItemOptions & {text: LangPackKey}
    ): ButtonMenuItemOptions => {
      const textElement = createPremiumLabel(options.text);
      return {
        ...options,
        text: undefined,
        textElement
      };
    };
    const updatePremiumIndicators = async() => {
      const generation = ++premiumIndicatorGeneration;
      try {
        const visible = await this.options.getPremiumRequired?.() ?? false;
        if(this.destroyed || generation !== premiumIndicatorGeneration) return;
        premiumIndicators.forEach((indicator) => indicator.hidden = !visible);
      } catch{
        if(generation !== premiumIndicatorGeneration) return;
        premiumIndicators.forEach((indicator) => indicator.hidden = true);
      }
    };
    const unsubscribe = this.options.subscribeCapabilities?.(() => void updatePremiumIndicators());
    if(unsubscribe) this.middlewareHelper.onDestroy(unsubscribe);

    this.top = document.createElement('div');
    this.top.classList.add(
      'message-input-editor-toolbar',
      'message-input-editor-toolbar-top'
    );

    this.history = document.createElement('div');
    this.history.classList.add('message-input-editor-toolbar-actions');
    this.history.setAttribute('aria-hidden', 'true');

    this.undoButton = this.createButton(
      'undo',
      'KeyboardShortcuts.Action.Undo'
    );
    this.redoButton = this.createButton(
      'redo',
      'KeyboardShortcuts.Action.Redo'
    );
    this.undoButton.disabled = true;
    this.redoButton.disabled = true;
    this.history.append(this.undoButton, this.redoButton);
    this.top.append(
      this.history,
      this.expandButton
    );

    attachClickEvent(this.undoButton, () => {
      this.run((editor) => editor.undo());
    }, {listenerSetter: this.listenerSetter, cancelMouseDown: true});
    attachClickEvent(this.redoButton, () => {
      this.run((editor) => editor.redo());
    }, {listenerSetter: this.listenerSetter, cancelMouseDown: true});

    this.bottom = document.createElement('div');
    this.bottom.classList.add(
      'message-input-editor-toolbar',
      'message-input-editor-toolbar-bottom'
    );
    this.bottom.setAttribute('aria-hidden', 'true');

    const aiButton = this.createButton(
      undefined,
      'Chat.Input.Editor.Toolbar.AI'
    );
    aiButton.append(createAiEditorIcon());
    aiButton.hidden = !this.options.onAi;
    const plusButton = this.createButton(
      'plus',
      'Chat.Input.Editor.Toolbar.More'
    );
    const listButton = this.createButton(
      'list_bulleted',
      'Chat.Input.Editor.Toolbar.Lists'
    );
    const tableButton = this.tableButton = this.createButton(
      'table',
      'Chat.Input.Editor.Toolbar.Table'
    );
    const linkButton = this.createButton(
      'link',
      'Chat.Input.Editor.Toolbar.Link'
    );
    const codeButton = this.createButton(
      'monospace',
      'Chat.Input.Editor.Toolbar.Code'
    );
    const mathButton = this.createButton(
      'formula',
      'Chat.Input.Editor.Toolbar.Math'
    );
    listButton.append(createPremiumIndicator());
    tableButton.append(createPremiumIndicator());
    mathButton.append(createPremiumIndicator());

    attachClickEvent(aiButton, () => {
      this.options.onAi?.();
    }, {listenerSetter: this.listenerSetter, cancelMouseDown: true});
    let plusMenuSelection: ReturnType<ChatInputEditor['captureSelection']>;
    const runPlusCommand = (command: (editor: ChatInputEditor) => boolean) => {
      if(plusMenuSelection) {
        this.editor?.restoreSelection(plusMenuSelection, false);
      }
      return this.run(command);
    };
    const headingMenuButtons: ButtonMenuItemOptions[] = ([
      [1, 'Chat.Input.Editor.Toolbar.Heading1', 'heading_1'],
      [2, 'Chat.Input.Editor.Toolbar.Heading2', 'heading_2'],
      [3, 'Chat.Input.Editor.Toolbar.Heading3', 'heading_3'],
      [4, 'Chat.Input.Editor.Toolbar.Heading4', 'heading_4'],
      [5, 'Chat.Input.Editor.Toolbar.Heading5', 'heading_5'],
      [6, 'Chat.Input.Editor.Toolbar.Heading6', 'heading_6']
    ] as const).map(([level, text, icon]) => withPremiumIndicator({
      icon,
      text,
      onClick: () => runPlusCommand((editor) => editor.toggleHeading(level))
    }));
    const headingSubmenuButton = createSubmenuTrigger({
      options: {
        icon: 'heading',
        regularText: createPremiumLabel('Chat.Input.Editor.Toolbar.Heading')
      },
      createSubmenu: () => ButtonMenuSync({buttons: headingMenuButtons})
    });
    this.listenerSetter.add(plusButton)('mousedown', (event) => event.preventDefault());
    ButtonMenuToggle({
      container: plusButton,
      listenerSetter: this.listenerSetter,
      direction: 'top-right',
      buttons: [{
        icon: 'text_block',
        text: 'Chat.Input.Editor.Toolbar.BodyText',
        onClick: () => runPlusCommand((editor) => editor.setBodyText())
      }, headingSubmenuButton, withPremiumIndicator({
        icon: 'text_add',
        text: 'Chat.Input.Editor.Toolbar.Footer',
        onClick: () => runPlusCommand((editor) => editor.insertFooter())
      }), {
        icon: 'quote_filled',
        text: 'Quote',
        onClick: () => runPlusCommand((editor) => editor.applyMarkup({type: 'quote'}))
      }, withPremiumIndicator({
        icon: 'pull_quote',
        text: 'Chat.Input.Editor.Toolbar.Pullquote',
        onClick: () => runPlusCommand((editor) => editor.insertPullquote())
      }), withPremiumIndicator({
        icon: 'toggle',
        text: 'Chat.Input.Editor.Toolbar.Details',
        onClick: () => runPlusCommand((editor) => editor.insertDetails())
      }), withPremiumIndicator({
        icon: 'slash',
        text: 'Chat.Input.Editor.Toolbar.Divider',
        onClick: () => runPlusCommand((editor) => editor.insertDivider())
      }), withPremiumIndicator({
        icon: 'arrow_right_square',
        text: 'Chat.Input.Editor.Toolbar.Button',
        onClick: () => void this.insertRichButton(plusMenuSelection)
      })],
      onOpenBefore: () => {
        plusMenuSelection = this.editor?.captureSelection();
      },
      onOpen: () => headingSubmenuButton.onOpen?.(),
      onClose: () => headingSubmenuButton.onClose?.()
    });
    attachClickEvent(tableButton, () => {
      this.run((editor) => editor.insertTable());
    }, {listenerSetter: this.listenerSetter, cancelMouseDown: true});
    attachClickEvent(linkButton, () => {
      void this.insertLink(this.editor?.captureSelection());
    }, {listenerSetter: this.listenerSetter, cancelMouseDown: true});
    attachClickEvent(codeButton, () => {
      this.run((editor) => editor.insertCodeBlock());
    }, {listenerSetter: this.listenerSetter, cancelMouseDown: true});

    const automaticCodeLanguage: MessageInputCodeLanguageOption = {
      label: I18n.format('Chat.Input.Editor.CodeLanguage.Auto', true),
      searchText: I18n.format('Chat.Input.Editor.CodeLanguage.Auto', true),
      value: ''
    };
    const customCodeLanguage: MessageInputCodeLanguageOption = {
      custom: true,
      label: I18n.format('Chat.Input.Editor.CodeLanguage.Custom', true),
      searchText: I18n.format('Chat.Input.Editor.CodeLanguage.Custom', true),
      value: '__custom__'
    };
    const codeLanguageOptions: MessageInputCodeLanguageOption[] = [
      automaticCodeLanguage,
      customCodeLanguage,
      ...Object.entries(CodeLanguageMap).map(([label, aliases]) => ({
        label,
        searchText: `${label} ${aliases.join(' ')}`,
        value: label.toLowerCase()
      }))
    ];
    const getCurrentCodeLanguageOption = () => {
      const language = this.editor?.getCodeBlockLanguage(
        this.languageElement
      );
      if(language === undefined) return;
      if(!language) return automaticCodeLanguage;
      const languageName = CodeLanguageAliases[language.toLowerCase()];
      return codeLanguageOptions.find((option) => (
        option.label === languageName ||
        option.value === language.toLowerCase()
      )) || {
        label: language,
        searchText: language,
        value: language
      };
    };
    this.languageMenu = createRoot((dispose) => {
      this.middlewareHelper.onDestroy(dispose);
      return createButtonMenuSelect<MessageInputCodeLanguageOption>({
        class: 'chat-input-code-language-menu',
        emptyText: I18n.format('NoResult', true),
        get value() {
          const current = getCurrentCodeLanguageOption();
          return current ? [current] : [];
        },
        onValueChange: ([option]) => {
          if(!option) return;
          const editor = this.editor;
          if(!editor) return;
          if(option.custom) {
            void this.editCodeLanguage(
              this.languageElement
            );
            return;
          }
          editor.setCodeBlockLanguage(
            option.value,
            this.languageElement
          );
          this.update();
        },
        options: codeLanguageOptions,
        optionKey: (option) => option.value,
        optionSearchText: (option) => option.searchText,
        renderOption: ({option, chosen}) => {
          const icon = chosen ?
            Icon('check', 'btn-menu-item-icon') :
            document.createElement('span');
          if(!chosen) icon.classList.add('btn-menu-item-icon');
          const label = document.createElement('span');
          label.classList.add('btn-menu-item-text');
          label.textContent = option.label;
          return [icon, label];
        },
        single: true,
        direction: 'bottom-right',
        floatingDirection: 'bottom-start',
        floatingOptions: {
          constrainHeight: true,
          flip: false
        }
      });
    });
    attachClickEvent(mathButton, () => {
      void this.insertMath(
        undefined,
        this.editor?.captureSelection()
      );
    }, {listenerSetter: this.listenerSetter, cancelMouseDown: true});

    let listMenuSelection: ReturnType<ChatInputEditor['captureSelection']>;
    const runListCommand = (command: (editor: ChatInputEditor) => boolean) => {
      if(listMenuSelection) this.editor?.restoreSelection(listMenuSelection, false);
      return this.run(command);
    };
    const orderedListTypes = [
      ['1', 'Chat.Input.Editor.List.Decimal'],
      ['a', 'Chat.Input.Editor.List.LowerAlpha'],
      ['A', 'Chat.Input.Editor.List.UpperAlpha'],
      ['i', 'Chat.Input.Editor.List.LowerRoman'],
      ['I', 'Chat.Input.Editor.List.UpperRoman']
    ] as const;
    const setOrderedListType = (type: string, item = false) => (
      runListCommand((editor) => {
        if(!editor.getOrderedListState() && !editor.toggleOrderedList()) return false;
        return item ?
          editor.setOrderedListItemType(type) :
          editor.setOrderedListType(type === '1' ? undefined : type);
      })
    );
    const orderedListStyleSubmenu = createSubmenuTrigger({
      options: {
        icon: 'list_numbered',
        regularText: i18n('Chat.Input.Editor.List.NumberStyle')
      },
      createSubmenu: () => ButtonMenuSync({
        buttons: orderedListTypes.map(([type, text]) => ({
          icon: 'list_numbered',
          text,
          onClick: () => setOrderedListType(type)
        }))
      })
    });
    const orderedListItemStyleSubmenu = createSubmenuTrigger({
      options: {
        icon: 'list_numbered',
        regularText: i18n('Chat.Input.Editor.List.ItemStyle')
      },
      createSubmenu: () => ButtonMenuSync({
        buttons: orderedListTypes.filter(([type]) => {
          if(type !== '1') return true;
          const listType = this.editor?.getOrderedListState()?.type;
          return isDecimalOrderedListType(listType);
        }).map(([type, text]) => ({
          icon: 'list_numbered',
          text,
          onClick: () => setOrderedListType(type, true)
        }))
      })
    });
    this.listenerSetter.add(listButton)('mousedown', (event) => event.preventDefault());
    ButtonMenuToggle({
      container: listButton,
      listenerSetter: this.listenerSetter,
      direction: 'top-right',
      buttons: [{
        icon: 'list_numbered',
        text: 'Chat.Input.Editor.Toolbar.OrderedList',
        onClick: () => runListCommand((editor) => editor.toggleOrderedList())
      }, {
        icon: 'list_bulleted',
        text: 'Chat.Input.Editor.Toolbar.BulletList',
        onClick: () => runListCommand((editor) => editor.toggleBulletList())
      }, withPremiumIndicator({
        icon: 'list_checked',
        text: 'Chat.Input.Editor.Toolbar.Checklist',
        onClick: () => runListCommand((editor) => editor.toggleTaskList())
      }), withPremiumIndicator({
        icon: 'toggle',
        text: 'Chat.Input.Editor.Toolbar.Details',
        onClick: () => runListCommand((editor) => editor.insertDetails())
      }), orderedListStyleSubmenu, orderedListItemStyleSubmenu, {
        icon: 'flip',
        text: 'Chat.Input.Editor.List.Reversed',
        onClick: () => runListCommand((editor) => editor.toggleOrderedListReversed())
      }],
      onOpenBefore: () => {
        listMenuSelection = this.editor?.captureSelection();
      },
      onOpen: () => {
        orderedListStyleSubmenu.onOpen?.();
        orderedListItemStyleSubmenu.onOpen?.();
      },
      onClose: () => {
        orderedListStyleSubmenu.onClose?.();
        orderedListItemStyleSubmenu.onClose?.();
      }
    });

    const bottomActions = document.createElement('div');
    bottomActions.classList.add(
      'message-input-editor-toolbar-actions',
      'message-input-editor-toolbar-actions-bottom'
    );
    bottomActions.append(
      aiButton,
      plusButton,
      listButton,
      tableButton,
      linkButton,
      codeButton,
      mathButton
    );
    this.bottom.append(bottomActions);
    queueMicrotask(() => void updatePremiumIndicators());
  }
}
