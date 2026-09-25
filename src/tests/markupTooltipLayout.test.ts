import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

describe('formatting MarkupTooltip layout', () => {
  const source = readFileSync(
    resolve(__dirname, '../components/chat/markupTooltip.ts'),
    'utf8'
  );
  const scrollableSource = readFileSync(
    resolve(__dirname, '../components/chat/markupTooltipScrollable.tsx'),
    'utf8'
  );
  const editorExtensionsSource = ['media', 'tableView', 'codeBlock'].map((name) => readFileSync(
    resolve(__dirname, `../components/chat/inputEditor/extensions/${name}.ts`),
    'utf8'
  )).join('\n');
  const mathTooltipSource = readFileSync(
    resolve(__dirname, '../components/chat/inputEditor/mathTooltip.ts'),
    'utf8'
  );
  const aiEditorButtonSource = readFileSync(
    resolve(__dirname, '../components/richMessageInput/ai.tsx'),
    'utf8'
  );
  const toolbarSource = readFileSync(
    resolve(__dirname, '../components/richMessageInput/toolbar.ts'),
    'utf8'
  );
  const aiEditorIconSource = readFileSync(
    resolve(__dirname, '../components/chat/createAiEditorIcon.ts'),
    'utf8'
  );
  const aiLettersPlainSource = readFileSync(
    resolve(__dirname, '../../assets/icons/ai_letters_plain.svg'),
    'utf8'
  );
  const popupSource = readFileSync(
    resolve(__dirname, '../components/popups/indexTsx.tsx'),
    'utf8'
  );
  const wrapRichTextSource = readFileSync(
    resolve(__dirname, '../lib/richTextProcessor/wrapRichText.ts'),
    'utf8'
  );
  const styles = readFileSync(
    resolve(__dirname, '../scss/partials/_chatMarkupTooltip.scss'),
    'utf8'
  );

  test('uses one scrollable row in the requested order', () => {
    const rowStart = source.indexOf('row.append(');
    const rowEnd = source.indexOf('\n    );', rowStart);
    const row = source.slice(rowStart, rowEnd);
    const orderedItems = [
      'this.aiButton',
      'this.aiDelimiter',
      'this.buttons.bold',
      'this.buttons.italic',
      'this.buttons.underline',
      'this.buttons.strikethrough',
      'this.buttons.quote',
      'this.dateLinkDelimiter',
      'this.buttons.date',
      'this.buttons.link',
      'this.extendedDelimiter',
      'this.buttons.monospace',
      'this.buttons.spoiler',
      'this.buttons.highlight',
      'this.buttons.subscript',
      'this.buttons.superscript'
    ];

    let previousIndex = -1;
    orderedItems.forEach((item) => {
      const index = row.indexOf(item);
      expect(index).toBeGreaterThan(previousIndex);
      previousIndex = index;
    });
    expect(source).not.toContain('secondaryRow');
    expect(styles).toContain('width: max-content');
    expect(source).toContain('mountMarkupTooltipScrollable({');
    expect(source).not.toContain('addEventListener(\'wheel\'');
    expect(scrollableSource).toContain('from \'@components/scrollable2\'');
    expect(scrollableSource).toContain('axis="x"');
  });

  test('contains no sliding inline link editor', () => {
    [
      'showLinkEditor',
      'linkInput',
      'linkApplyButton',
      'markup-tooltip-tools-link',
      'markup-tooltip-link-apply',
      '&.is-link'
    ].forEach((value) => {
      expect(source + styles).not.toContain(value);
    });
  });

  test('disables ripple on formatting and contextual tooltip buttons', () => {
    expect(source).toContain(
      'ButtonIcon(textLabel ? undefined : inactiveIcon, {noRipple: true})'
    );
    expect(source).toContain('ButtonIcon(undefined, {noRipple: true})');
    expect(editorExtensionsSource).toContain(
      'ButtonIcon(\'replace_circles\', {noRipple: true})'
    );
    expect(editorExtensionsSource).toContain(
      'ButtonIcon(\'image_add\', {noRipple: true})'
    );
    expect(mathTooltipSource).toContain(
      'ButtonIcon(\'checkround\', {noRipple: true})'
    );
  });

  test('keeps AI available in the chat formatting tooltip while the composer is collapsed', () => {
    expect(source).toContain(
      'const aiAvailable = this.input.classList.contains(\'input-message-input\');'
    );
    expect(aiEditorButtonSource).toContain('const available = !!target && !!field;');
    expect(aiEditorButtonSource).toContain('const visible = available && canShowButton();');
  });

  test('reuses the composite animated AI icon in every chat editor control', () => {
    expect(source).toContain('this.aiButton.append(createAiEditorIcon());');
    expect(toolbarSource).toContain('aiButton.append(createAiEditorIcon());');
    expect(aiEditorButtonSource).toContain('const icon = createAiEditorIcon();');
    expect(aiEditorIconSource).toContain('\'ai_letters_plain\'');
    expect(aiLettersPlainSource).not.toContain('M2.92334 7');
    expect(aiLettersPlainSource).not.toContain('M6.89307 0');
    expect(aiEditorIconSource).toContain('{icon: \'ai_star1\'');
    expect(aiEditorIconSource).toContain('{icon: \'ai_star2\'');
  });

  test('uses the new semantic icon set across rich-editor controls', () => {
    const toolbar = toolbarSource.slice(toolbarSource.indexOf('private construct()'));
    [
      'list_bulleted',
      'table',
      'formula',
      'heading',
      'heading_1',
      'heading_2',
      'heading_3',
      'heading_4',
      'heading_5',
      'heading_6',
      'text_block',
      'text_add',
      'quote_filled',
      'pull_quote',
      'toggle',
      'slash',
      'list_numbered',
      'list_checked'
    ].forEach((icon) => expect(toolbar).toContain(`'${icon}'`));
    const itemStyleMenu = toolbar.slice(
      toolbar.indexOf('const orderedListItemStyleSubmenu'),
      toolbar.indexOf('this.listenerSetter.add(listButton)')
    );
    expect(itemStyleMenu).toContain('icon: \'list_numbered\'');

    const tableMenuStart = editorExtensionsSource.indexOf(
      'private renderStandardMenu(kind: ChatTableSelectionKind)'
    );
    const tableMenuEnd = editorExtensionsSource.indexOf(
      '\n  private positionMenu()',
      tableMenuStart
    );
    const tableMenu = editorExtensionsSource.slice(tableMenuStart, tableMenuEnd);
    [
      'align_left_edge',
      'align_horizontal_center',
      'align_right_edge',
      'align_top',
      'align_vertical_center',
      'align_bottom',
      'table_add',
      'arrow_left_square_add',
      'arrow_right_square_add',
      'merge_horizontal',
      'merge_vertical'
    ].forEach((icon) => expect(tableMenu).toContain(`'${icon}'`));

    [
      'replace_circles',
      'image_add',
      'image_crossed',
      'carousel'
    ].forEach((icon) => expect(editorExtensionsSource).toContain(`'${icon}'`));
    expect(editorExtensionsSource).toContain(
      'createCodeHeaderButton(\'copy_alt\', \'code-header-copy\')'
    );
    expect(wrapRichTextSource).toContain(
      'createCodeHeaderButton(\'copy_alt\', \'code-header-copy\')'
    );
  });

  test('keeps the formula tooltip viewport-safe and positions it without transform', () => {
    const mathStylesStart = styles.indexOf('&.chat-input-math-tooltip');
    const mathStylesEnd = styles.indexOf('\n\t}', mathStylesStart);
    const mathStyles = styles.slice(mathStylesStart, mathStylesEnd);
    expect(mathStyles).toContain('max-width: calc(100vw - .5rem)');
    expect(mathStyles).not.toContain('padding-inline-start');
    expect(mathStyles).toContain('width: 27.25rem');
    expect(mathStyles).toContain('overflow: hidden');
    expect(mathStyles).toContain('margin: 0');
    expect(mathStyles).toContain('margin-inline-end: .5rem');
    expect(mathStyles).toContain('text-indent: 1rem');
    expect(mathStyles).toContain('&.can-scroll-start::before');
    expect(mathStyles).toContain('&.can-scroll-end::after');
    expect(mathStyles).not.toContain('26.25rem');
    expect(mathTooltipSource).toContain('tooltip.style.left =');
    expect(mathTooltipSource).toContain('tooltip.style.top =');
    expect(mathTooltipSource).toContain('void tooltip.offsetLeft;');
    expect(mathTooltipSource).toContain('tooltip.classList.add(\'is-visible\');');
    expect(mathTooltipSource).not.toContain('\'chat-input-math-tooltip\',\n      \'is-visible\'');
    expect(mathTooltipSource).toContain('input.scrollWidth - input.clientWidth');
    expect(mathTooltipSource).toContain('input.addEventListener(\'scroll\', updateInputOverflow)');
    expect(mathTooltipSource).not.toContain('tooltip.style.transform =');
    expect(mathTooltipSource).not.toContain('input.select()');
  });

  test('closes and stays hidden while an application menu is open', () => {
    expect(source).toContain(
      'contextMenuController.addEventListener(\'toggle\', this.onMenuToggle)'
    );
    expect(source).toContain('if(!this.input || !this.canFormatInput(this.input) || contextMenuController.isOpened())');
    expect(source).toContain('if(open) tooltipController.closeAll()');
  });

  test('closes active tooltips before every popup is shown', () => {
    const showStart = popupSource.indexOf('const show = () =>');
    const showEnd = popupSource.indexOf('\n  const hide = () =>', showStart);
    expect(popupSource.slice(showStart, showEnd)).toContain(
      'tooltipController.closeAll();'
    );
  });
});
