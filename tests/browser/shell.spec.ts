import {readFile, mkdir} from 'node:fs/promises';
import type {Locator, Page, TestInfo} from '@playwright/test';
import {test, expect, assertNoOverflow} from './isolation';

async function sidebar(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 900 && !await page.getByRole('button', {name: 'Закрыть навигацию'}).isVisible()) await page.getByRole('button', {name: 'Открыть навигацию'}).click();
}
async function closeSidebar(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 900 && await page.getByRole('button', {name: 'Закрыть навигацию'}).isVisible()) await page.getByRole('button', {name: 'Закрыть навигацию'}).click();
}
async function revealScreen(page: Page, id: string) {
  await sidebar(page);
  const screen = page.getByTestId(`step-nav-${id}`);
  if (!await screen.count()) {
    const folders = await page.locator('[data-testid^="folder-tab-"]').evaluateAll(tabs => tabs.map(tab => tab.getAttribute('data-testid')!));
    for (const folder of folders) {
      await page.getByTestId(folder).click();
      if (await screen.count()) break;
    }
  }
  await expect(screen).toBeVisible();
  return screen;
}
async function selectScreen(page: Page, id: string) {
  await (await revealScreen(page, id)).click();
  await expect(page.locator('[data-testid^="story-step-"]')).toHaveCount(1);
  await expect(page.getByTestId(`story-step-${id}`)).toBeVisible();
  if ((page.viewportSize()?.width ?? 1280) < 900) await expect(page.getByRole('button', {name: 'Закрыть навигацию'})).not.toBeVisible();
}
async function exported(page: Page) {
  const download = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+Shift+E');
  const path = await (await download).path();
  expect(path).not.toBeNull();
  const document = JSON.parse(await readFile(path!, 'utf8'));
  // A persistent download toast can cover the next drag target on short screens.
  const dismiss = page.getByRole('button', {name: 'Закрыть уведомление', exact: true});
  if (await dismiss.isVisible()) {
    // The mobile drawer makes the main panel inert; close it for the toast,
    // then restore the same folder navigation context before returning.
    const reopen = (page.viewportSize()?.width ?? 1280) < 900 && await page.getByRole('button', {name: 'Закрыть навигацию'}).isVisible();
    if (reopen) await closeSidebar(page);
    await dismiss.click();
    if (reopen) await sidebar(page);
  }
  return document;
}
async function buttonRows(screen: Locator) {
  return screen.locator('.editable-keyboard .reply-markup-row').evaluateAll(rows => rows.map(row => Array.from(row.querySelectorAll<HTMLElement>('[data-button-id]')).map(button => button.dataset.buttonId)));
}
async function startDragging(page: Page, source: Locator) {
  await source.scrollIntoViewIfNeeded();
  const box = await source.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 8, y, {steps: 3});
  await expect(page.locator('.editable-keyboard.is-dragging')).toHaveCount(1);
}
async function startScreenDragging(page: Page, source: Locator) {
  await source.scrollIntoViewIfNeeded();
  const box = await source.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 8, y, {steps: 3});
  await expect(page.locator('.folder-screen-list.is-screen-dragging')).toHaveCount(1);
}
async function dropAtCenter(page: Page, target: Locator, vertical = 0.5) {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height * vertical, {steps: 8});
  await page.mouse.up();
}
async function dropAtButton(page: Page, target: Locator, side: 'before' | 'after') {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * (side === 'before' ? 0.2 : 0.8), box!.y + box!.height / 2, {steps: 8});
  await page.mouse.up();
}
async function captureReview(page: Page, info: TestInfo, name: string) {
  await mkdir('artifacts/screenshots', {recursive: true});
  const path = `artifacts/screenshots/${info.project.name}-${name}.png`;
  await page.screenshot({path, fullPage: true});
  await info.attach(name, {path, contentType: 'image/png'});
}
async function physicalClickWithDetail(page: Page, target: Locator, clickCount: number) {
  await target.scrollIntoViewIfNeeded();
  const bounds = (await target.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  // One physical press/release; locator.click({clickCount: 2}) emits two presses.
  await page.mouse.down({clickCount});
  await page.mouse.up({clickCount});
}
async function selectAllAcrossFrame(page: Page, editor: Locator) {
  const length = (await editor.inputValue()).length;
  await editor.press('ControlOrMeta+A');
  const selection = () => editor.evaluate(element => {
    const textarea = element as HTMLTextAreaElement;
    return [textarea.selectionStart, textarea.selectionEnd];
  });
  expect(await selection()).toEqual([0, length]);
  await page.clock.runFor(32);
  expect(await selection()).toEqual([0, length]);
}
async function focusAuthoredMessage(screen: Locator, index = 0) {
  const editor = screen.locator('.message-editor').nth(index);
  await editor.focus();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveAttribute('aria-label', 'Текст сообщения');
  return editor;
}
async function expectAuthoredMessages(screen: Locator, values: string[]) {
  const editors = screen.locator('.message-editor');
  await expect(editors).toHaveCount(values.length);
  for (let index = 0; index < values.length; index++) await expect(editors.nth(index)).toHaveValue(values[index]);
}

test('Edit inspects one button; rows, destinations and export agree; Test uses occurrence keyboards', async ({page}, info) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.sidebar')).not.toContainText('Экспорт JSON');
  await expect(page.locator('.sidebar')).not.toContainText('Изменения в памяти этой сессии');
  await expect(page.locator('.sidebar')).not.toContainText('Перезагрузка вернёт стартовый пример');
  const fontRanges = await page.evaluate(() => Array.from(document.styleSheets).flatMap(sheet => Array.from(sheet.cssRules)).filter(rule => rule.type === CSSRule.FONT_FACE_RULE).map(rule => (rule as CSSFontFaceRule).style.getPropertyValue('unicode-range')));
  expect(fontRanges).toHaveLength(9);
  for (const range of fontRanges) expect(range).toMatch(/^U\+/);
  await mkdir('artifacts/screenshots', {recursive: true});
  await page.screenshot({path: `artifacts/screenshots/${info.project.name}-main.png`});
  await expect(page.locator('[data-testid^="step-nav-"]')).toHaveCount(4);
  await expect(page.locator('[data-testid^="story-step-"]')).toHaveCount(1);
  await page.getByTestId('story-step-start').getByRole('button', {name: 'Посмотреть материал', exact: true}).click();
  const inspector = page.getByTestId('keyboard-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.locator('input:visible, select:visible, textarea:visible')).toHaveCount(2);
  await expect(inspector.getByLabel('Подпись', {exact: true})).toBeVisible();
  await expect(inspector.getByRole('combobox', {name: 'Куда перейти', exact: true})).toBeVisible();
  await expect(inspector.locator('.order-controls, .keyboard-mini')).toHaveCount(0);
  await expect(inspector.getByText('Расположение', {exact: true})).toHaveCount(0);
  const inspectorScreenshot = `artifacts/screenshots/${info.project.name}-inspector.png`;
  await page.screenshot({path: inspectorScreenshot});
  await info.attach('button-inspector', {path: inspectorScreenshot, contentType: 'image/png'});
  await expect(page.getByTestId('run-user')).toHaveCount(0);
  await inspector.getByLabel('Подпись', {exact: true}).fill('Начать практику');
  await inspector.getByRole('combobox', {name: 'Куда перейти', exact: true}).selectOption('details');
  await inspector.getByRole('button', {name: 'Зелёный цвет', exact: true}).click();
  await expect(inspector.getByRole('button', {name: 'Зелёный цвет', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await inspector.getByRole('button', {name: 'Применить', exact: true}).click();
  await expect(inspector).toHaveCount(0);
  const movedButton = page.getByTestId('story-step-start').getByRole('button', {name: 'Начать практику', exact: true});
  await movedButton.press('Alt+ArrowRight');
  await movedButton.press('Alt+Shift+ArrowDown');
  await expect(movedButton).toHaveAttribute('data-button-color', 'green');
  const exportedDocument = await exported(page);
  expect(exportedDocument.schemaVersion).toBe(5);
  expect(exportedDocument.buttons['start-offer'].targetStepId).toBe('details');
  expect(exportedDocument.buttons['start-offer'].color).toBe('green');
  expect(exportedDocument.content.buttons['start-offer']).toBe('Начать практику');
  expect(exportedDocument.messages[exportedDocument.steps.start.messageIds[0]].rows.map((row: {buttonIds: string[]}) => row.buttonIds)).toEqual([['start-menu'], ['start-offer']]);
  expect(exportedDocument.content.messages[exportedDocument.steps.offer.messageIds[0]]).toContain('Три шага');
  expect(Object.keys(exportedDocument).sort()).toEqual(['bot', 'buttons', 'content', 'entryStepId', 'folderOrder', 'folders', 'id', 'messages', 'nextStepNumber', 'schemaVersion', 'steps']);
  expect(exportedDocument.folderOrder).toEqual(['start-folder', 'menu-folder']);
  expect(exportedDocument.folders['start-folder']).toEqual({stepIds: ['start', 'offer', 'material'], fallbackStepId: 'start-fallback'});
  expect(exportedDocument.content).not.toHaveProperty('fallbacks');
  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  await expect(page.getByTestId('run-bot')).toHaveCount(1);
  const initial = page.getByTestId('run-bot').first();
  await expect(initial.getByRole('button', {name: 'Начать практику', exact: true})).toHaveAttribute('data-button-color', 'green');
  await initial.getByRole('button', {name: 'Начать практику', exact: true}).evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  await expect(page.getByTestId('run-bot')).toHaveCount(2);
  await expect(page.getByTestId('run-user')).toHaveCount(1);
  await expect(initial.getByRole('button', {name: 'Начать практику', exact: true})).toBeDisabled();
  await page.getByTestId('run-bot').last().getByRole('button', {name: 'В меню', exact: true}).click();
  await expect(page.getByTestId('run-bot')).toHaveCount(3);
  await page.getByTestId('run-bot').last().getByRole('button', {name: 'В начало', exact: true}).click();
  await expect(page.getByTestId('run-bot')).toHaveCount(4);
  await expect(initial.getByRole('button', {name: 'Начать практику', exact: true})).toBeDisabled();
  await expect(page.getByTestId('run-bot').last().getByRole('button', {name: 'Начать практику', exact: true})).toBeEnabled();
  await page.getByRole('button', {name: 'В редактор', exact: true}).click();
  await expect(page.locator('[data-testid^="step-nav-"]')).toHaveCount(4);
  await expect(page.locator('[data-testid^="story-step-"]')).toHaveCount(1);
  await assertNoOverflow(page);
});

test('right click follows the authored button destination while ordinary click keeps editing it', async ({page}) => {
  await page.goto('/');
  const button = page.getByTestId('story-step-start').getByRole('button', {name: 'Посмотреть материал', exact: true});
  await button.click();
  await expect(page.getByTestId('keyboard-inspector')).toBeVisible();
  await page.getByTestId('keyboard-inspector').getByRole('button', {name: 'Отмена', exact: true}).click();
  await button.click({button: 'right'});
  await expect(page.getByTestId('story-step-offer')).toBeVisible();
  await expect(page.getByTestId('keyboard-inspector')).toHaveCount(0);
  await sidebar(page);
  await expect(page.getByTestId('step-nav-offer').getByRole('button', {name: 'Экран 02 · Что внутри материала', exact: true})).toHaveAttribute('aria-current', 'page');
});

test('screen numbers are stable references across reorder, delete, creation and Test navigation', async ({page}) => {
  await page.goto('/');
  await expect(page.getByTestId('step-nav-start').locator('.screen-avatar')).toHaveText('01');
  await expect(page.getByTestId('step-nav-offer').locator('.screen-avatar')).toHaveText('02');
  await expect(page.locator('.screen-number')).toHaveText('01');
  await expect(page.getByTestId('screen-boundary')).toContainText('01 · Знакомство');

  await page.getByRole('button', {name: 'Настройки экрана', exact: true}).click();
  await page.getByRole('button', {name: 'Экран ниже', exact: true}).click();
  await expect(page.locator('[data-testid^="step-nav-"]').nth(0).locator('.screen-avatar')).toHaveText('02');
  await expect(page.locator('[data-testid^="step-nav-"]').nth(1).locator('.screen-avatar')).toHaveText('01');

  await sidebar(page);
  await page.getByTestId('add-step').click();
  const firstNew = page.locator('[data-testid^="story-step-"]');
  const firstId = (await firstNew.getAttribute('data-testid'))!.replace('story-step-', '');
  await expect(page.getByTestId(`step-nav-${firstId}`).locator('.screen-avatar')).toHaveText('08');
  await expect(page.locator('.screen-number')).toHaveText('08');
  await page.getByLabel('Текст сообщения', {exact: true}).fill('Временный экран');
  await page.getByLabel('Текст сообщения', {exact: true}).press('ControlOrMeta+Enter');
  await page.getByRole('button', {name: 'Настройки экрана', exact: true}).click();
  await page.getByRole('button', {name: 'Удалить', exact: true}).click();
  await sidebar(page);
  await page.getByTestId('add-step').click();
  const secondNew = page.locator('[data-testid^="story-step-"]');
  const secondId = (await secondNew.getAttribute('data-testid'))!.replace('story-step-', '');
  await expect(page.getByTestId(`step-nav-${secondId}`).locator('.screen-avatar')).toHaveText('09');
  await page.getByLabel('Текст сообщения', {exact: true}).fill('Постоянный экран');
  await page.getByLabel('Текст сообщения', {exact: true}).press('ControlOrMeta+Enter');

  await selectScreen(page, 'start');
  await page.getByTestId('story-step-start').getByRole('button', {name: 'Посмотреть материал', exact: true}).click();
  const destinations = page.getByTestId('keyboard-inspector').getByRole('combobox', {name: 'Куда перейти', exact: true});
  await expect(destinations.locator('option[value="offer"]')).toHaveText('02 · Что внутри материала');
  await page.getByTestId('keyboard-inspector').getByRole('button', {name: 'Отмена', exact: true}).click();

  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  await page.getByTestId('run-bot').last().getByRole('button', {name: 'Посмотреть материал', exact: true}).click();
  await expect(page.locator('.screen-number')).toHaveText('02');
  await expect(page.getByTestId('screen-boundary')).toContainText('02 · Что внутри материала');
  await sidebar(page);
  await expect(page.getByTestId('step-nav-offer').getByRole('button', {name: 'Экран 02 · Что внутри материала', exact: true})).toHaveAttribute('aria-current', 'page');
});

test('text edit undo and missing-target failure preserve document; new step has an empty usable keyboard', async ({page}) => {
  await page.goto('/');
  const start = page.getByTestId('story-step-start');
  const originalText = await start.locator('.message-editor').inputValue();
  await expect(start.locator('.message-editor')).toHaveCount(1);
  await expect(start.getByRole('button', {name: 'Изменить текст сообщения', exact: true})).toHaveCount(0);
  await expect(page.getByLabel('Текст сообщения', {exact: true})).toHaveCount(0);
  const text = await focusAuthoredMessage(start);
  await text.fill('Мой новый текст\nВторая строка');
  await text.press('Escape');
  await expectAuthoredMessages(start, [originalText]);
  await focusAuthoredMessage(start);
  await text.fill('Сохранённая вручную правка');
  await text.press('ControlOrMeta+Enter');
  await expectAuthoredMessages(start, ['Сохранённая вручную правка']);
  await page.getByRole('button', {name: '↶ Отменить', exact: true}).click();
  await expectAuthoredMessages(start, [originalText]);
  await start.getByRole('button', {name: 'Добавить кнопку'}).click();
  const inspector = page.getByTestId('keyboard-inspector');
  await expect(inspector.getByLabel('Подпись', {exact: true})).toBeFocused();
  await inspector.getByLabel('Подпись', {exact: true}).fill('Пока без перехода');
  await inspector.getByRole('button', {name: 'Применить', exact: true}).click();
  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Пока без перехода', exact: true})).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('переход');
  await expect(page.getByTestId('run-user')).toHaveCount(0);
  await expect(page.getByTestId('run-bot')).toHaveCount(1);
  await page.getByRole('button', {name: 'В редактор', exact: true}).click();
  await sidebar(page);
  await page.getByTestId('add-step').click();
  await expect(page.locator('[data-testid^="step-nav-"]')).toHaveCount(5);
  await expect(page.locator('[data-testid^="story-step-"]')).toHaveCount(1);
  await page.getByLabel('Текст сообщения', {exact: true}).fill('Дополнительная полезная информация');
  await page.getByLabel('Текст сообщения', {exact: true}).press('ControlOrMeta+Enter');
  const empty = page.locator('[data-testid^="story-step-"]');
  await expect(empty.getByRole('button', {name: 'Добавить кнопку'})).toBeVisible();
  await empty.getByRole('button', {name: 'Добавить кнопку'}).click();
  await inspector.getByLabel('Подпись', {exact: true}).fill('Вернуться');
  await inspector.getByRole('combobox', {name: 'Куда перейти', exact: true}).selectOption('start');
  await inspector.getByRole('button', {name: 'Применить', exact: true}).click();
  await expect(empty.getByRole('button', {name: 'Вернуться', exact: true})).toBeVisible();
  await assertNoOverflow(page);
});

test('offline examples are explicit; arbitrary prompt stays intact; reload resets session only', async ({page}) => {
  await page.goto('/');
  await sidebar(page);
  await page.getByLabel('Запрос к AI').fill('Придумай уникального бота для моей компании');
  await expect(page.getByLabel('Запрос к AI')).toHaveValue('Придумай уникального бота для моей компании');
  await page.getByRole('button', {name: 'Применить с AI', exact: true}).click();
  await expect(page.locator('.notice[role="status"]')).toContainText('не подключён');
  await expect(page.getByLabel('Запрос к AI')).toHaveValue('Придумай уникального бота для моей компании');
  await expect(page.locator('[data-testid^="step-nav-"]')).toHaveCount(4);
  await expect(page.locator('[data-testid^="story-step-"]')).toHaveCount(1);
  await page.getByText('Попробовать локальный пример', {exact: true}).click();
  await page.getByRole('button', {name: 'Изменить приветствие', exact: true}).click();
  await page.getByRole('button', {name: 'Применить с AI', exact: true}).click();
  await expect(page.locator('.notice[role="status"]')).toContainText('Локальный пример применён');
  await closeSidebar(page);
  await page.getByRole('button', {name: 'Тёмная тема', exact: true}).click();
  await expect(page.locator('.shell')).toHaveAttribute('data-theme', 'night');
  await assertNoOverflow(page);
  page.on('dialog', dialog => void dialog.accept());
  await page.reload();
  await expect(page.getByTestId('story-step-start').locator('.message-editor')).toHaveValue(/Привет! Я/);
  await expect(page.locator('.shell')).toHaveAttribute('data-theme', 'day');
});

test('typing preserves the node and caret; composition, dark inspector and drawer resize keep context', async ({page}, info) => {
  await page.goto('/');
  const start = page.getByTestId('story-step-start');
  const originalText = await start.locator('.message-editor').inputValue();
  const input = await focusAuthoredMessage(start);
  await input.fill('alpha omega');
  await input.evaluate(element => {element.setAttribute('data-caret-identity', 'original'); (element as HTMLTextAreaElement).setSelectionRange(6, 6);});
  await input.pressSequentially('NEW ');
  await expect(input).toHaveValue('alpha NEW omega');
  await expect(input).toHaveAttribute('data-caret-identity', 'original');
  expect(await input.evaluate(element => (element as HTMLTextAreaElement).selectionStart)).toBe(10);
  await input.dispatchEvent('compositionstart', {data: ''});
  await input.evaluate(element => {
    const textarea = element as HTMLTextAreaElement;
    textarea.value = 'alpha NEW 漢 omega';
    textarea.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertCompositionText', data: '漢', isComposing: true}));
  });
  await input.press('Enter');
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute('data-caret-identity', 'original');
  await page.getByTestId('folder-tab-menu-folder').dispatchEvent('click');
  await expect(input).toHaveAttribute('data-caret-identity', 'original');
  await expect(page.getByTestId('folder-tab-start-folder')).toHaveAttribute('aria-current', 'page');
  await input.dispatchEvent('compositionend', {data: '漢'});
  await input.press('ControlOrMeta+Enter');
  await expect(page.getByLabel('Текст сообщения', {exact: true})).toHaveCount(0);
  await expect(start.locator('.message-editor')).toHaveValue(/^alpha NEW 漢 omega\n?$/);
  await page.getByRole('button', {name: '↶ Отменить', exact: true}).click();
  await expectAuthoredMessages(start, [originalText]);
  await page.getByRole('button', {name: 'Тёмная тема', exact: true}).click();
  await start.getByRole('button', {name: 'Посмотреть материал', exact: true}).click();
  const inspector = page.getByTestId('keyboard-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByLabel('Подпись', {exact: true})).toBeFocused();
  await inspector.screenshot({path: `artifacts/screenshots/${info.project.name}-dark-inspector.png`});
  await inspector.getByRole('button', {name: 'Отмена', exact: true}).click();
  if ((page.viewportSize()?.width ?? 1280) < 900) {
    await sidebar(page);
    await page.setViewportSize({width: 900, height: 900});
    await expect(page.locator('main')).not.toHaveAttribute('inert', '');
    await page.setViewportSize({width: 375, height: 480});
    await expect(page.getByRole('button', {name: 'Открыть навигацию'})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Закрыть навигацию'})).not.toBeVisible();
  }
  await assertNoOverflow(page);
});

test('page lifecycle restoration resets the session and cancels an older pending reply', async ({page}) => {
  await page.goto('/');
  await page.clock.install();
  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  await page.getByTestId('run-bot').getByRole('button', {name: 'Посмотреть материал', exact: true}).press('Enter');
  await expect(page.getByTestId('run-user')).toHaveCount(1);
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted: true}));
    window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true}));
  });
  await expect(page.locator('[data-testid^="step-nav-"]')).toHaveCount(4);
  await expect(page.locator('[data-testid^="story-step-"]')).toHaveCount(1);
  await page.clock.fastForward(1000);
  await expect(page.getByTestId('run-user')).toHaveCount(0);
  await expect(page.getByTestId('run-bot')).toHaveCount(0);
  await expect(page.getByTestId('story-step-start').locator('.message-editor')).toHaveValue(/Привет! Я/);
});

test('screen chats stay separate, previews follow edits and start/end badges follow the graph', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('[data-testid^="story-step-"]')).toHaveCount(1);
  await expect(page.locator('[data-testid^="step-nav-"]')).toHaveCount(4);
  await expect(page.getByTestId('step-start-start')).toHaveCount(1);
  await expect(page.locator('[data-testid^="step-end-"]')).toHaveCount(0);
  await selectScreen(page, 'details');
  await expect(page.getByTestId('story-step-start')).toHaveCount(0);
  const detailsEditor = await focusAuthoredMessage(page.getByTestId('story-step-details'));
  await detailsEditor.fill('Мой полезный ответ.\nЗдесь находится инструкция.');
  await detailsEditor.press('ControlOrMeta+Enter');
  await expect(page.getByTestId('step-preview-details')).toHaveText('Мой полезный ответ. Здесь находится инструкция.');
  await selectScreen(page, 'offer');
  await expect(page.getByTestId('story-step-offer').locator('.message-editor')).toHaveValue(/Три шага/);
  await selectScreen(page, 'details');
  await expect(page.getByTestId('story-step-details').locator('.message-editor')).toHaveValue(/Мой полезный ответ/);

  await selectScreen(page, 'start');
  await page.getByRole('button', {name: 'Настройки экрана', exact: true}).click();
  await page.getByRole('button', {name: 'Экран ниже', exact: true}).click();
  await expect(page.locator('[data-testid^="step-nav-"]').first()).toHaveAttribute('data-testid', 'step-nav-offer');
  await expect(page.getByTestId('step-start-start')).toHaveCount(1);
  await expect(page.getByTestId('step-start-offer')).toHaveCount(0);
  await expect(page.getByTestId('screen-boundary')).toContainText('Начало бота');
  await selectScreen(page, 'details');
  await page.getByRole('button', {name: 'Настройки экрана', exact: true}).click();
  await page.getByRole('button', {name: 'Сделать началом', exact: true}).click();
  await expect(page.getByTestId('step-start-start')).toHaveCount(0);
  await expect(page.getByTestId('step-start-details')).toHaveCount(1);
  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  await expect(page.getByTestId('run-bot')).toContainText('Мой полезный ответ.');
  await page.getByRole('button', {name: 'В редактор', exact: true}).click();

  await sidebar(page);
  await page.getByTestId('add-step').click();
  const newScreen = page.locator('[data-testid^="story-step-"]');
  const newId = (await newScreen.getAttribute('data-testid'))!.replace('story-step-', '');
  const emptyEditor = page.getByLabel('Текст сообщения', {exact: true});
  await expect(emptyEditor).toBeFocused();
  const emptyLayout = await page.getByTestId('chat-scroll').evaluate((scroll, editor) => {
    const viewport = scroll.getBoundingClientRect();
    const input = (editor as HTMLElement).getBoundingClientRect();
    return {height: input.height, centerDelta: Math.abs((input.top + input.bottom) / 2 - (viewport.top + viewport.bottom) / 2)};
  }, await emptyEditor.elementHandle());
  expect(emptyLayout.height).toBeGreaterThanOrEqual(180);
  expect(emptyLayout.centerDelta).toBeLessThan(140);
  await expect(page.getByTestId(`step-end-${newId}`)).toHaveCount(0);
  await expect(page.getByTestId(`step-nav-${newId}`)).toContainText('Пустой экран');
  await page.getByLabel('Текст сообщения', {exact: true}).fill('Готово. Материал теперь у вас.');
  await page.getByLabel('Текст сообщения', {exact: true}).press('ControlOrMeta+Enter');
  await expect(page.getByTestId(`step-end-${newId}`)).toHaveText('Конец');
  await expect(page.getByTestId('screen-boundary')).toContainText('Конец ветки');
  await expect(page.locator('[data-testid^="step-nav-"]').last()).toHaveAttribute('data-testid', 'step-nav-menu-fallback');
  await expect(page.getByTestId('step-end-menu')).toHaveCount(0);
  await newScreen.getByRole('button', {name: 'Добавить кнопку'}).click();
  await page.getByTestId('keyboard-inspector').getByLabel('Подпись', {exact: true}).fill('Продолжить');
  await page.getByTestId('keyboard-inspector').getByRole('button', {name: 'Применить', exact: true}).click();
  await expect(page.getByTestId(`step-end-${newId}`)).toHaveCount(0);
  await expect(page.getByTestId(`step-nav-${newId}`)).toContainText('Есть кнопки без перехода');
  await assertNoOverflow(page);
});

test('visitor text and multiline messages stay literal and use the current folder fallback keyboard', async ({page}) => {
  await page.goto('/');
  await page.clock.install({time: new Date('2026-09-08T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-09-08T12:00:01Z'));
  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  const composer = page.getByRole('textbox', {name: 'Сообщение', exact: true});
  const send = page.getByRole('button', {name: 'Отправить сообщение', exact: true});
  const first = page.getByTestId('run-bot').first();
  await composer.fill('Посмотреть материал');
  await composer.press('Enter');
  await expect(page.locator('[data-message-kind="text"]')).toHaveCount(1);
  await expect(composer).toHaveValue('');
  await expect(page.getByTestId('run-bot')).toHaveCount(1);
  await expect(page.locator('[data-message-kind="user"]')).toHaveCount(0);
  await page.clock.runFor(350);
  await expect(page.getByTestId('run-bot')).toHaveCount(2);
  await expect(page.getByTestId('run-bot').last()).toContainText('Не удалось понять сообщение.');
  await expect(first.getByRole('button', {name: 'Посмотреть материал', exact: true})).toBeDisabled();
  await expect(page.getByTestId('run-bot').last().getByRole('button', {name: 'Вернуться в раздел', exact: true})).toBeEnabled();

  await composer.fill('Первая строка');
  await composer.press('Shift+Enter');
  await composer.pressSequentially('Вторая строка');
  await expect(composer).toHaveValue('Первая строка\nВторая строка');
  await send.click();
  await expect(page.locator('[data-message-kind="text"]')).toHaveCount(2);
  await expect(page.locator('[data-message-kind="text"]').last().locator('.message')).toContainText('Первая строка\nВторая строка', {useInnerText: false});
  await page.clock.runFor(350);

  const literal = '<script>window.__unexpected = true</script>';
  await composer.fill(literal);
  await send.click();
  await expect(page.locator('[data-message-kind="text"]')).toHaveCount(3);
  await expect(page.locator('[data-message-kind="text"]').last()).toContainText(literal);
  expect(await page.evaluate(() => Object.hasOwn(window, '__unexpected'))).toBe(false);
  await page.clock.runFor(350);
  await expect(page.getByTestId('run-bot')).toHaveCount(4);
  const overLimit = 'x'.repeat(4097);
  await composer.fill(overLimit);
  await send.click();
  await expect(composer).toHaveValue(overLimit);
  await expect(page.getByRole('alert')).toContainText('4096');
  await expect(page.locator('[data-message-kind="text"]')).toHaveCount(3);
  await composer.fill('');
  await page.getByTestId('run-bot').last().getByRole('button', {name: 'Вернуться в раздел', exact: true}).press('Enter');
  await page.clock.runFor(350);
  await page.getByTestId('run-bot').last().getByRole('button', {name: 'Посмотреть материал', exact: true}).press('Enter');
  await page.clock.runFor(350);
  await expect(page.getByTestId('run-bot')).toHaveCount(6);
  await expect(page.locator('[data-message-kind="user"]')).toHaveCount(2);
  await expect(page.getByTestId('run-bot').last()).toContainText('Три шага');
  await expect(page.getByTestId('run-bot').last().getByRole('button', {name: 'Как попробовать', exact: true})).toBeEnabled();
  await assertNoOverflow(page);
});

test('visitor composition sends once; pending input is retained and /start replaces either fallback or button reply', async ({page}) => {
  await page.goto('/');
  await page.clock.install({time: new Date('2026-09-08T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-09-08T12:00:01Z'));
  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  const composer = page.getByRole('textbox', {name: 'Сообщение', exact: true});
  await composer.evaluate(element => element.setAttribute('data-composer-identity', 'original'));
  await composer.dispatchEvent('compositionstart', {data: ''});
  await composer.evaluate(element => {
    const textarea = element as HTMLTextAreaElement;
    textarea.value = '漢字';
    textarea.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertCompositionText', data: '漢字', isComposing: true}));
  });
  await composer.dispatchEvent('keydown', {key: 'Enter', code: 'Enter', bubbles: true, isComposing: true});
  await expect(page.locator('[data-message-kind="text"]')).toHaveCount(0);
  await expect(composer).toHaveValue('漢字');
  await composer.dispatchEvent('compositionend', {data: '漢字'});
  await composer.press('Enter');
  await expect(page.locator('[data-message-kind="text"]')).toHaveCount(1);
  await expect(page.locator('[data-message-kind="text"]').last()).toContainText('漢字');
  await expect(composer).toHaveValue('');
  await composer.press('Enter');
  await expect(page.locator('[data-message-kind="text"]')).toHaveCount(1);
  await composer.fill('Вопрос во время перехода');
  await composer.press('Enter');
  await expect(composer).toHaveValue('Вопрос во время перехода');
  await expect(page.getByRole('alert')).toContainText('Дождитесь ответа бота');
  await expect(page.locator('[data-message-kind="text"]')).toHaveCount(1);
  await page.clock.runFor(100);
  await composer.fill('/start');
  await composer.press('Enter');
  await expect(composer).toHaveValue('');
  await expect(composer).toHaveAttribute('data-composer-identity', 'original');
  await expect(composer).toBeFocused();
  await expect(page.locator('[data-message-kind="text"]')).toHaveCount(2);
  await page.clock.runFor(349);
  await expect(page.getByTestId('run-bot')).toHaveCount(1);
  await page.clock.runFor(1);
  await expect(page.getByTestId('run-bot')).toHaveCount(2);
  await expect(page.getByTestId('run-bot').last()).toContainText('Привет! Я');
  await expect(page.getByTestId('run-bot').filter({hasText: 'Не удалось понять сообщение.'})).toHaveCount(0);

  await page.getByTestId('run-bot').last().getByRole('button', {name: 'Посмотреть материал', exact: true}).press('Enter');
  await page.clock.runFor(100);
  await composer.fill('/start@myAibOt');
  await composer.press('Enter');
  await page.clock.runFor(250);
  await expect(page.getByTestId('run-bot')).toHaveCount(2);
  await page.clock.runFor(100);
  await expect(page.getByTestId('run-bot')).toHaveCount(3);
  await expect(page.getByTestId('run-bot').last()).toContainText('Привет! Я');
  await expect(page.getByTestId('run-bot').filter({hasText: 'Три шага'})).toHaveCount(0);
  await expect(page.getByTestId('run-bot').first().getByRole('button', {name: 'Посмотреть материал', exact: true})).toBeDisabled();
  await page.clock.runFor(1000);
  await expect(page.getByTestId('run-bot')).toHaveCount(3);
  await composer.fill('Незавершённое сообщение');
  await page.getByRole('button', {name: 'Начать заново', exact: true}).click();
  await expect(composer).toHaveAttribute('data-composer-identity', 'original');
  await expect(composer).toHaveValue('');
  await expect(page.getByTestId('run-bot')).toHaveCount(1);
  await expect(page.locator('[data-message-kind="text"]')).toHaveCount(0);
  await expect(page.locator('[data-message-kind="user"]')).toHaveCount(0);
  await assertNoOverflow(page);
});

test('folder fallback is an editable full screen and follows runtime ownership rather than the filtered folder', async ({page}, info) => {
  await page.goto('/');
  await expect(page.getByRole('button', {name: 'Ответы бота', exact: true})).toHaveCount(0);
  const reply = 'Старт: выберите материал. <b>Текст без HTML</b>';
  await selectScreen(page, 'start-fallback');
  const screen = page.getByTestId('story-step-start-fallback');
  const firstEditor = await focusAuthoredMessage(screen);
  await firstEditor.fill(reply);
  await firstEditor.press('ControlOrMeta+Enter');
  await screen.getByRole('button', {name: 'Добавить сообщение', exact: true}).click();
  await page.getByLabel('Текст сообщения', {exact: true}).fill('Дополнительная инструкция из этой же папки.');
  await page.getByLabel('Текст сообщения', {exact: true}).press('ControlOrMeta+Enter');
  await selectScreen(page, 'menu-fallback');
  const menuFallbackEditor = await focusAuthoredMessage(page.getByTestId('story-step-menu-fallback'));
  await menuFallbackEditor.fill('Меню: такой команды нет. Выберите раздел.');
  await menuFallbackEditor.press('ControlOrMeta+Enter');
  await selectScreen(page, 'start');
  await page.clock.install({time: new Date('2026-09-08T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-09-08T12:00:01Z'));
  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  const bot = page.getByTestId('run-bot');
  const composer = page.getByRole('textbox', {name: 'Сообщение', exact: true});
  await sidebar(page);
  await page.getByTestId('folder-tab-menu-folder').click();
  await expect(page.getByTestId('folder-tab-menu-folder')).toHaveAttribute('aria-current', 'page');
  await closeSidebar(page);
  await expect(bot).toHaveCount(1);
  await expect(page.locator('.screen-number')).toHaveText('01');
  await composer.fill('Что дальше?');
  await composer.press('Enter');
  await page.clock.runFor(350);
  await expect(bot).toHaveCount(3);
  await expect(bot.nth(1).locator('.message-text')).toHaveText(reply);
  await expect(bot.nth(1).locator('.message-text b')).toHaveCount(0);
  await expect(bot.nth(2)).toContainText('Дополнительная инструкция');
  await expect(page.locator('.screen-number')).toHaveText('06');
  await expect(bot.nth(1).getByRole('button', {name: 'Вернуться в раздел', exact: true})).toBeEnabled();
  // The fallback's authored button supports the same Test inspector as every screen.
  await bot.nth(1).getByRole('button', {name: 'Вернуться в раздел', exact: true}).press('Shift+F10');
  const inspector = page.getByTestId('keyboard-inspector');
  await inspector.getByLabel('Подпись', {exact: true}).fill('К материалам');
  await inspector.getByRole('button', {name: 'Применить', exact: true}).click();
  await bot.nth(1).getByRole('button', {name: 'К материалам', exact: true}).press('Enter');
  await page.clock.runFor(350);
  await expect(bot).toHaveCount(4);
  await expect(bot.last()).toContainText('Привет! Я');
  await (await revealScreen(page, 'menu')).click();
  await expect(page.getByTestId('run-history')).not.toHaveAttribute('open', '');
  await composer.fill('/help');
  await composer.press('Enter');
  await page.clock.runFor(350);
  await expect(bot.last()).toContainText('Меню: такой команды нет.');
  await expect(page.locator('.screen-number')).toHaveText('07');
  await captureReview(page, info, 'folder-fallback');
  await composer.fill('/start');
  await composer.press('Enter');
  await page.clock.runFor(350);
  await expect(bot.last()).toContainText('Привет! Я');
  await expect(page.locator('.screen-number')).toHaveText('01');
  const saved = await exported(page);
  expect(saved.folders['start-folder'].fallbackStepId).toBe('start-fallback');
  expect(saved.content.messages['start-fallback-message']).toBe(reply);
  expect(saved.content.buttons['start-fallback-back']).toBe('К материалам');
  expect(saved).not.toHaveProperty('fallbacks');
  expect(saved).not.toHaveProperty('stepOrder');
  expect(saved.content).not.toHaveProperty('fallbacks');
  await assertNoOverflow(page);
});

test('a blank fallback in any folder blocks Test launch until authored content is restored', async ({page}) => {
  await page.goto('/');
  await selectScreen(page, 'menu-fallback');
  const fallback = page.getByTestId('story-step-menu-fallback');
  const text = await fallback.locator('.message-editor').inputValue();
  const fallbackEditor = await focusAuthoredMessage(fallback);
  await fallbackEditor.fill('');
  await fallbackEditor.press('ControlOrMeta+Enter');
  await selectScreen(page, 'start');
  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  await expect(page.getByTestId('run-bot')).toHaveCount(0);
  await expect(page.getByTestId('story-step-start')).toBeVisible();
  await expect(page.locator('.notice[role="status"]')).toContainText('Папка «Меню», ответ «Если непонятно»');
  await expect(page.locator('.notice[role="status"]')).toContainText('Сообщение 1 на экране пустое');
  await selectScreen(page, 'offer');
  await page.getByRole('button', {name: 'Настройки экрана', exact: true}).click();
  await page.getByRole('button', {name: 'Пройти с этого экрана', exact: true}).click();
  await expect(page.getByTestId('run-bot')).toHaveCount(0);
  await expect(page.locator('.notice[role="status"]')).toContainText('Папка «Меню»');
  await selectScreen(page, 'menu-fallback');
  const restoredEditor = await focusAuthoredMessage(page.getByTestId('story-step-menu-fallback'));
  await restoredEditor.fill(text);
  await restoredEditor.press('ControlOrMeta+Enter');
  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  await expect(page.getByTestId('run-bot')).toHaveCount(1);
  await expect(page.getByTestId('run-bot')).toContainText('Привет! Я');
  await assertNoOverflow(page);
});

test('folders create two screens, rename atomically, transfer ordinary screens and protect their fallback', async ({page}, info) => {
  await page.goto('/');
  await sidebar(page);
  await page.getByTestId('add-folder').click();
  const name = page.getByLabel('Название папки', {exact: true});
  await expect(name).toBeFocused();
  await name.fill('Поддержка');
  await name.press('Enter');
  await expect(page.getByTestId('selected-folder-title')).toHaveText('Поддержка');
  await expect(page.locator('[data-testid^="step-nav-"]')).toHaveCount(2);
  const created = await exported(page);
  const folderId = created.folderOrder.find((id: string) => !['start-folder', 'menu-folder'].includes(id));
  expect(folderId).toBeTruthy();
  const folder = created.folders[folderId];
  expect(folder.stepIds).toHaveLength(1);
  const ordinaryId = folder.stepIds[0];
  const fallbackId = folder.fallbackStepId;
  expect(fallbackId).not.toBe(ordinaryId);
  expect(created.steps[ordinaryId].number).toBe(8);
  expect(created.steps[fallbackId].number).toBe(9);
  expect(created.content.folders[folderId].title).toBe('Поддержка');
  expect(created.content.messages[created.steps[ordinaryId].messageIds[0]].trim()).not.toBe('');
  expect(created.content.messages[created.steps[fallbackId].messageIds[0]].trim()).not.toBe('');
  await expect(page.getByTestId(`step-fallback-${fallbackId}`)).toContainText('Если непонятно');
  await expect(page.locator('[data-testid^="step-nav-"]').last()).toHaveAttribute('data-testid', `step-nav-${fallbackId}`);

  await page.getByTestId('selected-folder-title').click();
  await name.fill('Несохранённое имя');
  await name.press('Escape');
  await expect(page.getByTestId('selected-folder-title')).toHaveText('Поддержка');
  await page.getByTestId('selected-folder-title').click();
  await name.fill('Помощь');
  await page.locator('.sidebar .brand strong').click();
  await expect(page.getByTestId('selected-folder-title')).toHaveText('Помощь');
  await expect(page.getByTestId(`folder-name-${folderId}`)).toHaveText('Помощь');
  await page.getByRole('button', {name: 'Действия с папкой', exact: true}).click();
  await expect(page.getByRole('menuitem', {name: 'Удалить папку', exact: true})).toBeDisabled();
  await page.keyboard.press('Escape');
  await captureReview(page, info, 'folder-rail');

  await selectScreen(page, fallbackId);
  await page.getByRole('button', {name: 'Настройки экрана', exact: true}).click();
  await expect(page.getByRole('combobox', {name: 'Папка экрана', exact: true})).toHaveCount(0);
  for (const action of ['Сделать началом', 'Экран выше', 'Экран ниже', 'Удалить']) await expect(page.getByRole('button', {name: action, exact: true})).toBeDisabled();
  await expect(page.getByTestId(`step-end-${fallbackId}`)).toHaveCount(0);
  await selectScreen(page, ordinaryId);
  await page.getByRole('button', {name: 'Настройки экрана', exact: true}).click();
  await page.getByRole('combobox', {name: 'Папка экрана', exact: true}).selectOption('start-folder');
  await expect(page.getByTestId(`story-step-${ordinaryId}`)).toBeVisible();
  const moved = await exported(page);
  expect(moved.folders[folderId].stepIds).toEqual([]);
  expect(moved.folders['start-folder'].stepIds).toContain(ordinaryId);
  expect(moved.steps[ordinaryId].number).toBe(8);
  expect(moved.content.messages[created.steps[ordinaryId].messageIds[0]]).toBe(created.content.messages[created.steps[ordinaryId].messageIds[0]]);
  await sidebar(page);
  await page.getByTestId(`folder-tab-${folderId}`).click();
  await expect(page.locator('[data-testid^="step-nav-"]')).toHaveCount(1);
  await page.getByRole('button', {name: 'Действия с папкой', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Удалить папку', exact: true}).click();
  await expect(page.getByTestId(`folder-tab-${folderId}`)).toHaveCount(0);
  const deleted = await exported(page);
  expect(deleted.folderOrder).toEqual(['start-folder', 'menu-folder']);
  expect(deleted.folders).not.toHaveProperty(folderId);
  expect(deleted.steps).not.toHaveProperty(fallbackId);
  expect(deleted.content.folders).not.toHaveProperty(folderId);
  for (const id of created.steps[fallbackId].messageIds) {
    expect(deleted.messages).not.toHaveProperty(id);
    expect(deleted.content.messages).not.toHaveProperty(id);
  }
  expect(deleted.steps[ordinaryId].number).toBe(8);
  await closeSidebar(page);
  await assertNoOverflow(page);
});

test('button drag moves within a row, across rows and into a new row without changing labels or destinations', async ({page}) => {
  await page.goto('/');
  await selectScreen(page, 'menu');
  const screen = page.getByTestId('story-step-menu');
  await screen.getByRole('button', {name: 'О материале', exact: true}).click();
  await page.getByTestId('keyboard-inspector').getByRole('button', {name: 'Зелёный цвет', exact: true}).click();
  await page.getByTestId('keyboard-inspector').getByRole('button', {name: 'Применить', exact: true}).click();
  const original = await exported(page);
  const button = (id: string) => screen.locator(`.editable-keyboard [data-button-id="${id}"]`);

  await startDragging(page, button('menu-offer'));
  await dropAtButton(page, button('menu-details'), 'after');
  await expect.poll(() => buttonRows(screen)).toEqual([['menu-details', 'menu-offer'], ['menu-material', 'menu-start']]);
  await expect(page.getByTestId('keyboard-inspector')).toHaveCount(0);

  await startDragging(page, button('menu-offer'));
  await dropAtButton(page, button('menu-material'), 'before');
  await expect.poll(() => buttonRows(screen)).toEqual([['menu-details'], ['menu-offer', 'menu-material', 'menu-start']]);
  await startDragging(page, button('menu-offer'));
  const gap = screen.locator('[data-keyboard-drop="new-row"][data-gap-index="2"]');
  await expect(gap).toBeVisible();
  const gapBox = await gap.boundingBox();
  expect(gapBox).not.toBeNull();
  await page.mouse.move(gapBox!.x + gapBox!.width / 2, gapBox!.y + gapBox!.height / 2, {steps: 8});
  await page.mouse.up();
  await expect.poll(() => buttonRows(screen)).toEqual([['menu-details'], ['menu-material', 'menu-start'], ['menu-offer']]);
  await expect(page.getByTestId('keyboard-inspector')).toHaveCount(0);
  const changed = await exported(page);
  await expect(button('menu-offer')).toHaveAttribute('data-button-color', 'green');
  expect(changed.buttons).toEqual(original.buttons);
  expect(changed.content).toEqual(original.content);
  expect(changed.messages[changed.steps.menu.messageIds[0]].rows.map((row: {buttonIds: string[]}) => row.buttonIds)).toEqual([['menu-details'], ['menu-material', 'menu-start'], ['menu-offer']]);

  await page.getByRole('button', {name: '↶ Отменить', exact: true}).click();
  await expect.poll(() => buttonRows(screen)).toEqual([['menu-details'], ['menu-offer', 'menu-material', 'menu-start']]);
  await page.getByRole('button', {name: '↶ Отменить', exact: true}).click();
  await expect.poll(() => buttonRows(screen)).toEqual([['menu-details', 'menu-offer'], ['menu-material', 'menu-start']]);
  await page.getByRole('button', {name: '↶ Отменить', exact: true}).click();
  expect(await exported(page)).toEqual(original);
  await assertNoOverflow(page);
});

test('button drag cancellation preserves the document and keyboard alternatives perform one undoable move', async ({page}) => {
  await page.goto('/');
  await selectScreen(page, 'menu');
  const screen = page.getByTestId('story-step-menu');
  const original = await exported(page);
  const source = screen.locator('.editable-keyboard [data-button-id="menu-offer"]');
  await startDragging(page, source);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByTestId('keyboard-inspector')).toHaveCount(0);
  await expect(screen.locator('[data-keyboard-drop="new-row"]')).toHaveCount(0);
  expect(await exported(page)).toEqual(original);

  await startDragging(page, source);
  await source.dispatchEvent('pointercancel', {pointerId: 1, pointerType: 'mouse', bubbles: true});
  await page.mouse.up();
  await expect(page.getByTestId('keyboard-inspector')).toHaveCount(0);
  await expect(screen.locator('[data-keyboard-drop="new-row"]')).toHaveCount(0);
  expect(await exported(page)).toEqual(original);
  await expect(page.getByRole('button', {name: '↶ Отменить', exact: true})).toBeDisabled();

  await source.press('Alt+ArrowRight');
  await expect.poll(() => buttonRows(screen)).toEqual([['menu-details', 'menu-offer'], ['menu-material', 'menu-start']]);
  await source.press('Alt+ArrowDown');
  await expect.poll(() => buttonRows(screen)).toEqual([['menu-details'], ['menu-material', 'menu-start', 'menu-offer']]);
  await source.press('Alt+Shift+ArrowDown');
  await expect.poll(() => buttonRows(screen)).toEqual([['menu-details'], ['menu-material', 'menu-start'], ['menu-offer']]);
  for (let index = 0; index < 3; index++) await page.getByRole('button', {name: '↶ Отменить', exact: true}).click();
  expect(await exported(page)).toEqual(original);
  await source.click();
  await expect(page.getByTestId('keyboard-inspector')).toBeVisible();
  await page.getByTestId('keyboard-inspector').getByRole('button', {name: 'Отмена', exact: true}).click();
  await assertNoOverflow(page);
});

test('cross-pane drag assigns button transitions in both directions and sidebar drag reorders one folder', async ({page}) => {
  test.skip((page.viewportSize()?.width ?? 0) < 900, 'Cross-pane linking needs both panes visible; mobile keeps the inspector destination control.');
  await page.goto('/');
  const original = await exported(page);
  const story = page.getByTestId('story-step-start');
  const offerButton = story.locator('.editable-keyboard [data-button-id="start-offer"]');
  const menuButton = story.locator('.editable-keyboard [data-button-id="start-menu"]');
  const offerRow = page.getByTestId('step-nav-offer');
  const materialRow = page.getByTestId('step-nav-material');

  await expect(page.getByRole('button', {name: '↶ Отменить', exact: true})).toBeDisabled();
  await startDragging(page, offerButton);
  const offerTarget = offerRow.getByRole('button', {name: /Экран 02/});
  const offerTargetBox = await offerTarget.boundingBox();
  expect(offerTargetBox).not.toBeNull();
  await page.mouse.move(offerTargetBox!.x + offerTargetBox!.width / 2, offerTargetBox!.y + offerTargetBox!.height / 2, {steps: 8});
  await expect(offerRow).toHaveClass(/is-link-target/);
  await page.mouse.up();
  await expect(page.getByRole('button', {name: '↶ Отменить', exact: true})).toBeDisabled();
  expect(await exported(page)).toEqual(original);

  await startDragging(page, offerButton);
  await page.mouse.move(offerTargetBox!.x + offerTargetBox!.width / 2, offerTargetBox!.y + offerTargetBox!.height / 2, {steps: 8});
  await expect(offerRow).toHaveClass(/is-link-target/);
  const heading = await page.locator('.folder-heading').boundingBox();
  expect(heading).not.toBeNull();
  await page.mouse.move(heading!.x + heading!.width / 2, heading!.y + heading!.height / 2, {steps: 5});
  await expect(offerRow).not.toHaveClass(/is-link-target/);
  await page.mouse.up();
  await expect(page.getByRole('button', {name: '↶ Отменить', exact: true})).toBeDisabled();
  expect(await exported(page)).toEqual(original);

  await startDragging(page, offerButton);
  const materialTarget = materialRow.getByRole('button', {name: /Экран 04/});
  const materialTargetBox = await materialTarget.boundingBox();
  expect(materialTargetBox).not.toBeNull();
  await page.mouse.move(materialTargetBox!.x + materialTargetBox!.width / 2, materialTargetBox!.y + materialTargetBox!.height / 2, {steps: 8});
  await expect(materialRow).toHaveClass(/is-link-target/);
  await page.mouse.up();
  await expect(page.getByTestId('keyboard-inspector')).toHaveCount(0);
  await expect(page.getByTestId('story-step-start')).toBeVisible();
  const buttonLinked = await exported(page);
  expect(buttonLinked.buttons).toEqual({...original.buttons, 'start-offer': {...original.buttons['start-offer'], targetStepId: 'material'}});
  expect(buttonLinked.content).toEqual(original.content);
  expect(buttonLinked.messages).toEqual(original.messages);
  await page.getByRole('button', {name: '↶ Отменить', exact: true}).click();
  expect(await exported(page)).toEqual(original);

  await startScreenDragging(page, offerTarget);
  const menuButtonBox = await menuButton.boundingBox();
  expect(menuButtonBox).not.toBeNull();
  await page.mouse.move(menuButtonBox!.x + menuButtonBox!.width / 2, menuButtonBox!.y + menuButtonBox!.height / 2, {steps: 8});
  await expect(menuButton).toHaveClass(/is-link-target/);
  await page.mouse.up();
  await expect(page.getByTestId('keyboard-inspector')).toHaveCount(0);
  await expect(page.getByTestId('story-step-start')).toBeVisible();
  const screenLinked = await exported(page);
  expect(screenLinked.buttons).toEqual({...original.buttons, 'start-menu': {...original.buttons['start-menu'], targetStepId: 'offer'}});
  expect(screenLinked.content).toEqual(original.content);
  expect(screenLinked.messages).toEqual(original.messages);
  await page.getByRole('button', {name: '↶ Отменить', exact: true}).click();
  expect(await exported(page)).toEqual(original);

  await startScreenDragging(page, materialRow.getByRole('button', {name: /Экран 04/}));
  await dropAtCenter(page, page.getByTestId('step-nav-start').getByRole('button', {name: /Экран 01/}), 0.2);
  await expect(page.getByTestId('story-step-start')).toBeVisible();
  await expect(page.locator('[data-testid^="step-nav-"]').nth(0)).toHaveAttribute('data-testid', 'step-nav-material');
  const reordered = await exported(page);
  expect(reordered.folders['start-folder'].stepIds).toEqual(['material', 'start', 'offer']);
  expect(reordered.folders['start-folder'].fallbackStepId).toBe('start-fallback');
  expect(reordered.steps.start.number).toBe(1);
  expect(reordered.steps.offer.number).toBe(2);
  expect(reordered.steps.material.number).toBe(4);
  expect(reordered.buttons).toEqual(original.buttons);
  await page.getByRole('button', {name: '↶ Отменить', exact: true}).click();
  expect(await exported(page)).toEqual(original);
  await assertNoOverflow(page);
});

test('touch hold reorders sidebar screens and keeps the fallback pinned', async ({page, browserName}, info) => {
  test.skip(browserName !== 'chromium' || info.project.name !== 'chromium-375x812', 'Chromium CDP touch regression runs once in the phone profile.');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 1});
  await page.goto('/');
  await sidebar(page);
  const source = page.getByTestId('step-nav-material').getByRole('button', {name: /Экран 04/});
  const destination = page.getByTestId('step-nav-start').getByRole('button', {name: /Экран 01/});
  const sourceBox = await source.boundingBox(), destinationBox = await destination.boundingBox();
  expect(sourceBox).not.toBeNull(); expect(destinationBox).not.toBeNull();
  const startX = sourceBox!.x + sourceBox!.width / 2, startY = sourceBox!.y + sourceBox!.height / 2;
  const endX = destinationBox!.x + destinationBox!.width / 2, endY = destinationBox!.y + destinationBox!.height * 0.2;
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{x, y, id: 1, radiusX: 3, radiusY: 3, force: 1}]
  });
  await touch('touchStart', startX, startY);
  await expect(page.locator('.folder-screen-list.is-screen-dragging')).toHaveCount(1);
  for(let index = 1; index <= 5; index++) await touch('touchMove', startX + (endX - startX) * index / 5, startY + (endY - startY) * index / 5);
  await touch('touchEnd');
  await expect(page.locator('[data-testid^="step-nav-"]').first()).toHaveAttribute('data-testid', 'step-nav-material');
  await expect(page.locator('[data-testid^="step-nav-"]').last()).toHaveAttribute('data-testid', 'step-nav-start-fallback');
  await closeSidebar(page);
  await page.getByRole('button', {name: '↶ Отменить', exact: true}).click();
  await sidebar(page);
  await expect(page.locator('[data-testid^="step-nav-"]').first()).toHaveAttribute('data-testid', 'step-nav-start');
  await cdp.detach();
  await assertNoOverflow(page);
});

test('emulated touch scrolls button labels and a whole-button hold arms dragging without a visible grip', async ({page, browserName}, info) => {
  test.skip(browserName !== 'chromium' || info.project.name !== 'chromium-375x812', 'Chromium CDP touch regression runs once in the phone profile; other projects retain pointer and keyboard coverage.');
  await page.setViewportSize({width: 375, height: 480});
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 1});
  await page.goto('/');
  await selectScreen(page, 'menu');
  const screen = page.getByTestId('story-step-menu');
  await expect(screen.locator('[data-keyboard-grip], .keyboard-grip')).toHaveCount(0);
  const menuEditor = await focusAuthoredMessage(screen);
  await menuEditor.fill(Array.from({length: 14}, (_, index) => `Шаг ${index + 1}: попробуйте идею и сохраните результат.`).join('\n'));
  await menuEditor.press('ControlOrMeta+Enter');
  const source = screen.locator('.editable-keyboard [data-button-id="menu-offer"]');
  const scroller = page.getByTestId('chat-scroll');
  await source.scrollIntoViewIfNeeded();
  const box = (await source.boundingBox())!;
  const beforeScroll = await scroller.evaluate(element => element.scrollTop);
  expect(beforeScroll).toBeGreaterThan(80);
  const x = box.x + box.width * 0.65;
  const y = box.y + box.height / 2;
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', clientX = 0, clientY = 0) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{x: clientX, y: clientY, id: 1, radiusX: 3, radiusY: 3, force: 1}]
  });
  // These are browser-generated touch/pointer events, not synthetic dispatchEvent calls.
  await touch('touchStart', x, y);
  for (let index = 1; index <= 6; index++) await touch('touchMove', x, y + index * 12);
  await touch('touchEnd');
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeLessThan(beforeScroll - 5);
  await expect(page.locator('.editable-keyboard.is-dragging')).toHaveCount(0);
  await expect(page.getByTestId('keyboard-inspector')).toHaveCount(0);
  expect(await buttonRows(screen)).toEqual([['menu-offer', 'menu-details'], ['menu-material', 'menu-start']]);

  await source.scrollIntoViewIfNeeded();
  const sourceBox = (await source.boundingBox())!;
  const targetBox = (await screen.locator('.editable-keyboard [data-button-id="menu-details"]').boundingBox())!;
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  await touch('touchStart', startX, startY);
  await expect(page.locator('.editable-keyboard.is-dragging')).toHaveCount(1);
  for (let index = 1; index <= 5; index++) {
    await touch('touchMove', startX + (targetBox.x + targetBox.width * 0.8 - startX) * index / 5, startY);
  }
  await expect(page.locator('.editable-keyboard.is-dragging')).toHaveCount(1);
  await touch('touchEnd');
  await expect.poll(() => buttonRows(screen)).toEqual([['menu-details', 'menu-offer'], ['menu-material', 'menu-start']]);
  await expect(page.getByTestId('keyboard-inspector')).toHaveCount(0);
  await page.getByRole('button', {name: '↶ Отменить', exact: true}).click();
  expect(await buttonRows(screen)).toEqual([['menu-offer', 'menu-details'], ['menu-material', 'menu-start']]);
  await cdp.detach();
  await assertNoOverflow(page);
});

test('inspector remains anchored on desktop and keeps mobile actions inside the visible viewport', async ({page}) => {
  await page.goto('/');
  const mobile = (page.viewportSize()?.width ?? 1280) < 900;
  const start = page.getByTestId('story-step-start');
  if (!mobile) {
    const editor = await focusAuthoredMessage(start);
    await editor.fill(Array.from({length: 28}, (_, index) => `Полезная строка ${index + 1}`).join('\n'));
    await editor.press('ControlOrMeta+Enter');
  }
  const anchor = start.getByRole('button', {name: 'Посмотреть материал', exact: true});
  await anchor.click();
  const inspector = page.getByTestId('keyboard-inspector');
  await expect(inspector.getByRole('button', {name: 'Применить', exact: true})).toBeVisible();
  if (mobile) {
    await expect(inspector).toHaveAttribute('data-position', 'bottom-sheet');
    // Geometry emulation exercises visualViewport listeners; it is not a physical keyboard test.
    await page.evaluate(() => {
      const viewport = window.visualViewport!;
      Object.defineProperty(viewport, 'height', {configurable: true, get: () => 220});
      Object.defineProperty(viewport, 'offsetTop', {configurable: true, get: () => 40});
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(async () => {
      const rect = await inspector.boundingBox();
      return !!rect && rect.y >= 40 && rect.y + rect.height <= 261;
    }).toBe(true);
    const body = inspector.locator('.inspector-body');
    expect(await body.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await body.evaluate(element => {element.scrollTop = element.scrollHeight;});
    expect(await body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    const applyBounds = await inspector.getByRole('button', {name: 'Применить', exact: true}).boundingBox();
    expect(applyBounds).not.toBeNull();
    expect(applyBounds!.y + applyBounds!.height).toBeLessThanOrEqual(261);
  } else {
    await expect(inspector).toHaveAttribute('data-position', 'above');
    const anchorBounds = await anchor.boundingBox();
    const dialogBounds = await inspector.boundingBox();
    expect(anchorBounds).not.toBeNull();
    expect(dialogBounds).not.toBeNull();
    expect(dialogBounds!.y + dialogBounds!.height).toBeLessThanOrEqual(anchorBounds!.y - 9);
    // Move the rendered anchor to the right boundary to exercise the live rectangle resolver.
    await anchor.evaluate(element => {
      const box = element.getBoundingClientRect();
      (element as HTMLElement).style.transform = `translateX(${window.innerWidth - 90 - box.left}px)`;
      window.dispatchEvent(new Event('resize'));
    });
    await expect.poll(async () => {
      const rect = await inspector.boundingBox();
      return !!rect && Math.abs(rect.x + rect.width - ((page.viewportSize()?.width ?? 0) - 16)) <= 1;
    }).toBe(true);
    await page.setViewportSize({width: 900, height: 650});
    await expect.poll(async () => {
      const rect = await inspector.boundingBox();
      return !!rect && rect.x >= 15 && rect.y >= 15 && rect.x + rect.width <= 885 && rect.y + rect.height <= 635;
    }).toBe(true);
  }
  await inspector.getByRole('button', {name: 'Отмена', exact: true}).click();
  await expect(inspector).toHaveCount(0);
});

test('native message insets and timestamp stay inside the bubble in narrow view and during text editing', async ({page}) => {
  await page.setViewportSize({width: 375, height: 812});
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const start = page.getByTestId('story-step-start');
  const editor = await focusAuthoredMessage(start);
  await editor.fill('Полезный материал для вашего проекта.\nПоследняя строка заканчивается здесь.');
  const geometry = async () => start.locator('.bubble-content').evaluate(element => {
    const bubble = element.getBoundingClientRect();
    const message = element.querySelector<HTMLElement>('.message')!;
    const messageBounds = message.getBoundingClientRect();
    const time = element.querySelector<HTMLElement>('.time-inner')!.getBoundingClientRect();
    const textarea = message.querySelector('textarea');
    const text = message.querySelector('.message-text');
    const range = document.createRange();
    if(text) range.selectNodeContents(text);
    const lines = textarea ? [textarea.getBoundingClientRect()] : Array.from(range.getClientRects());
    const overlaps = lines.some(line => line.width > 0 && line.height > 0 && line.left < time.right - 1 && line.right > time.left + 1 && line.top < time.bottom - 1 && line.bottom > time.top + 1);
    return {
      top: messageBounds.top - bubble.top, left: messageBounds.left - bubble.left,
      right: bubble.right - messageBounds.right, bottom: bubble.bottom - messageBounds.bottom,
      timeInside: time.left >= bubble.left && time.top >= bubble.top && time.right <= bubble.right + 1 && time.bottom <= bubble.bottom + 1,
      overlaps
    };
  });
  for (const editing of [true, false]) {
    if (!editing) await page.getByLabel('Текст сообщения', {exact: true}).press('ControlOrMeta+Enter');
    const measured = await geometry();
    expect(measured.top).toBeCloseTo(4, 0);
    expect(measured.left).toBeCloseTo(8, 0);
    expect(measured.right).toBeCloseTo(8, 0);
    expect(measured.bottom).toBeCloseTo(5, 0);
    expect(measured.timeInside).toBe(true);
    expect(measured.overlaps).toBe(false);
  }
  await assertNoOverflow(page);
});

test('persistent authoring textarea keeps native bubble geometry through focus, save and multiline edits', async ({page}, info) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.clock.install({time: new Date('2026-09-07T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-09-07T12:00:01Z'));
  await sidebar(page);
  await page.getByTestId('add-step').click();
  const screen = page.locator('[data-testid^="story-step-"]');
  const editor = page.getByLabel('Текст сообщения', {exact: true});
  await editor.focus();
  await editor.pressSequentially('Черновик');
  await selectAllAcrossFrame(page, editor);
  await editor.pressSequentially('Готово.');
  await expect(editor).toHaveValue('Готово.');
  await page.getByTestId('screen-boundary').click();
  await expect(editor).toHaveCount(0);
  const persistent = screen.locator('.message-editor');
  await expect(persistent).toHaveCount(1);
  await expect(persistent).toHaveValue('Готово.');
  await expect(screen.getByRole('button', {name: 'Изменить текст сообщения', exact: true})).toHaveCount(0);

  const width = async () => (await screen.locator('.bubble-content').boundingBox())!.width;
  const shortWidth = await width();
  await focusAuthoredMessage(screen);
  expect(await width()).toBeCloseTo(shortWidth, 0);
  expect(await persistent.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await selectAllAcrossFrame(page, persistent);
  await persistent.pressSequentially('Готово. Ваш материал здесь.');
  await expect(persistent).toHaveValue('Готово. Ваш материал здесь.');
  await persistent.fill('Готово. Ваш материал здесь.\n\nСохраните идею и попробуйте её сегодня.\nНапишите, что получилось.');
  expect(await persistent.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const activeWidth = await width();
  await persistent.press('ControlOrMeta+Enter');
  await expect(editor).toHaveCount(0);
  await expect(persistent).toHaveValue(/Сохраните идею/);
  expect(await width()).toBeCloseTo(activeWidth, 0);
  await focusAuthoredMessage(screen);
  expect(await width()).toBeCloseTo(activeWidth, 0);
  const bounds = await screen.locator('.bubble-content').evaluate(element => {
    const bubble = element.getBoundingClientRect();
    const textarea = element.querySelector('textarea')!.getBoundingClientRect();
    const time = element.querySelector('.time-inner')!.getBoundingClientRect();
    return {textareaInside: textarea.left >= bubble.left && textarea.right <= bubble.right + 1,
      timeInside: time.right <= bubble.right + 1 && time.bottom <= bubble.bottom + 1,
      timeAfterText: time.top >= textarea.bottom - 1};
  });
  expect(bounds).toEqual({textareaInside: true, timeInside: true, timeAfterText: true});
  await mkdir('artifacts/screenshots', {recursive: true});
  await page.screenshot({path: `artifacts/screenshots/${info.project.name}-editing.png`});
  await persistent.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(persistent).toHaveValue(/Сохраните идею/);
  await assertNoOverflow(page);
});

test('ordered screen messages keep independent keyboards and every button in the latest Test batch works', async ({page}, info) => {
  await page.goto('/');
  const screen = page.getByTestId('story-step-start');
  const messages = ['Сначала познакомимся.', 'Затем покажу полезный материал.', 'Теперь выберите, куда перейти.'];
  const firstEditor = await focusAuthoredMessage(screen);
  await firstEditor.fill(messages[0]);
  await firstEditor.press('ControlOrMeta+Enter');
  for (const text of messages.slice(1)) {
    await screen.getByRole('button', {name: 'Добавить сообщение', exact: true}).click();
    await expect(page.getByLabel('Текст сообщения', {exact: true})).toBeFocused();
    await page.getByLabel('Текст сообщения', {exact: true}).fill(text);
    await page.getByLabel('Текст сообщения', {exact: true}).press('ControlOrMeta+Enter');
  }
  await expectAuthoredMessages(screen, messages);
  const bubbles = screen.locator('.bubble');
  await expect(bubbles).toHaveCount(3);
  await expect(bubbles.nth(0).locator('.reply-markup')).toHaveCount(1);
  await expect(bubbles.nth(1).locator('.reply-markup')).toHaveCount(0);
  await expect(bubbles.nth(2).locator('.reply-markup')).toHaveCount(0);
  await bubbles.nth(1).getByRole('button', {name: '＋ Добавить кнопку', exact: true}).click();
  const inspector = page.getByTestId('keyboard-inspector');
  await inspector.getByLabel('Подпись', {exact: true}).fill('Сразу к практике');
  await inspector.getByRole('combobox', {name: 'Куда перейти', exact: true}).selectOption('details');
  await inspector.getByRole('button', {name: 'Применить', exact: true}).click();
  await expect(bubbles.nth(0).getByRole('button', {name: 'Посмотреть материал', exact: true})).toBeVisible();
  await expect(bubbles.nth(1).getByRole('button', {name: 'Сразу к практике', exact: true})).toBeVisible();
  const saved = await exported(page);
  const ids: string[] = saved.steps.start.messageIds;
  expect(saved.schemaVersion).toBe(5);
  expect(ids).toHaveLength(3);
  expect(new Set(ids).size).toBe(3);
  expect(ids[0]).toBe('start-message');
  expect(ids.map(id => saved.content.messages[id])).toEqual(messages);
  expect(saved.content.steps.start).toEqual({title: 'Знакомство'});
  expect(saved.messages[ids[0]].rows.flatMap((row: {buttonIds: string[]}) => row.buttonIds)).toEqual(['start-offer', 'start-menu']);
  const secondButtons: string[] = saved.messages[ids[1]].rows.flatMap((row: {buttonIds: string[]}) => row.buttonIds);
  expect(secondButtons).toHaveLength(1);
  expect(saved.buttons[secondButtons[0]].targetStepId).toBe('details');
  expect(saved.messages[ids[2]].rows).toEqual([]);

  await page.clock.install({time: new Date('2026-09-07T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-09-07T12:00:01Z'));
  await focusAuthoredMessage(screen, 1);
  messages[1] = 'Внутри — три шага от вашей идеи до результата.';
  const editor = page.getByLabel('Текст сообщения', {exact: true});
  await expect(editor).toBeFocused();
  await selectAllAcrossFrame(page, editor);
  await editor.pressSequentially(messages[1]);
  await expect(editor).toHaveValue(messages[1]);
  await editor.press('ControlOrMeta+Enter');
  await expectAuthoredMessages(screen, messages);
  await focusAuthoredMessage(screen, 2);
  await screen.getByRole('button', {name: 'Удалить сообщение', exact: true}).click();
  await expect(bubbles).toHaveCount(2);
  await expect(bubbles.nth(1).locator('.reply-markup')).toHaveCount(1);
  await captureReview(page, info, 'independent-keyboards');
  const deleted = await exported(page);
  expect(deleted.steps.start.messageIds).toEqual(ids.slice(0, 2));
  expect(Object.hasOwn(deleted.content.messages, ids[2])).toBe(false);
  expect(Object.hasOwn(deleted.messages, ids[2])).toBe(false);
  await page.getByRole('button', {name: '↶ Отменить', exact: true}).click();
  await expectAuthoredMessages(screen, messages);
  const restored = await exported(page);
  expect(restored.steps.start.messageIds).toEqual(ids);
  expect(ids.map(id => restored.content.messages[id])).toEqual(messages);

  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  const bot = page.getByTestId('run-bot');
  await expect(bot).toHaveCount(3);
  await expect(bot.locator('.message-text')).toHaveText(messages);
  await expect(bot.nth(0).getByRole('button', {name: 'Посмотреть материал', exact: true})).toBeEnabled();
  await expect(bot.nth(1).getByRole('button', {name: 'Сразу к практике', exact: true})).toBeEnabled();
  await expect(bot.nth(2).locator('.reply-markup')).toHaveCount(0);
  await bot.nth(0).getByRole('button', {name: 'Посмотреть материал', exact: true}).press('Enter');
  await expect(bot).toHaveCount(3);
  await page.clock.runFor(350);
  await expect(bot).toHaveCount(4);
  await expect(bot.last()).toContainText('Три шага');
  const composer = page.getByRole('textbox', {name: 'Сообщение', exact: true});
  await composer.fill('/start');
  await composer.press('Enter');
  await expect(bot).toHaveCount(4);
  await page.clock.runFor(350);
  await expect(bot).toHaveCount(7);
  for (let index = 0; index < 3; index++) await expect(bot.nth(index + 4).locator('.message-text')).toHaveText(messages[index]);
  await expect(bot.nth(4).getByRole('button', {name: 'Посмотреть материал', exact: true})).toBeEnabled();
  await expect(bot.nth(5).getByRole('button', {name: 'Сразу к практике', exact: true})).toBeEnabled();
  await expect(bot.last().locator('.reply-markup')).toHaveCount(0);
  await expect(bot.nth(0).getByRole('button', {name: 'Посмотреть материал', exact: true})).toBeDisabled();
  await expect(bot.nth(1).getByRole('button', {name: 'Сразу к практике', exact: true})).toBeDisabled();
  await bot.nth(5).getByRole('button', {name: 'Сразу к практике', exact: true}).press('Enter');
  await page.clock.runFor(350);
  await expect(bot).toHaveCount(8);
  await expect(bot.last()).toContainText('Возьми одну реальную задачу');
  await page.getByRole('button', {name: 'Начать заново', exact: true}).click();
  await expect(bot.locator('.message-text')).toHaveText(messages);
  await expect(page.getByTestId('run-user')).toHaveCount(0);
  await assertNoOverflow(page);
});

test('abandoned new messages disappear without undo history; filled messages commit once and message creation stays visually separate', async ({page}, info) => {
  await page.goto('/');
  const screen = page.getByTestId('story-step-start');
  const original = await exported(page);
  const undo = page.getByRole('button', {name: '↶ Отменить', exact: true});
  const editor = page.getByLabel('Текст сообщения', {exact: true});
  const addMessage = screen.getByRole('button', {name: 'Добавить сообщение', exact: true});
  const badge = page.getByTestId('screen-boundary');
  for (const variant of ['empty', 'whitespace-ime', 'type-clear']) {
    await addMessage.click();
    await expect(editor).toBeFocused();
    await expect(screen.locator('.bubble')).toHaveCount(2);
    if (variant === 'whitespace-ime') {
      await editor.dispatchEvent('compositionstart', {data: ''});
      await editor.fill('  \n\t ');
      await editor.evaluate(element => (element as HTMLTextAreaElement).blur());
      await expect(editor).toHaveCount(1);
      await expect(screen.locator('.bubble')).toHaveCount(2);
      await editor.dispatchEvent('compositionend', {data: ''});
    } else {
      if (variant === 'type-clear') {
        await editor.fill('Текст, который передумали добавлять.');
        await editor.fill('');
      }
      await badge.click();
    }
    await expect(editor).toHaveCount(0);
    await expect(screen.locator('.bubble')).toHaveCount(1);
    await expectAuthoredMessages(screen, [original.content.messages['start-message']]);
    await expect(screen.locator('.bubble').first().locator('.reply-markup')).toHaveCount(1);
    await expect(undo).toBeDisabled();
    expect(await exported(page)).toEqual(original);
  }
  const addedText = 'Дополнительное сообщение сохраняется после выхода из поля.';
  await addMessage.click();
  await editor.fill(addedText);
  await badge.click();
  await expect(editor).toHaveCount(0);
  await expectAuthoredMessages(screen, [original.content.messages['start-message'], addedText]);
  await undo.click();
  await expect(screen.locator('.bubble')).toHaveCount(1);
  await expect(undo).toBeDisabled();
  expect(await exported(page)).toEqual(original);

  await mkdir('artifacts/screenshots', {recursive: true});
  for (const theme of ['day', 'night']) {
    if (theme === 'night') await page.getByRole('button', {name: 'Тёмная тема', exact: true}).click();
    await page.mouse.move(0, 0);
    const service = await badge.evaluate(element => ({color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor}));
    expect(service.color).toBe('rgb(255, 255, 255)');
    expect(service.background).not.toBe('rgba(0, 0, 0, 0)');
    const addButton = screen.getByRole('button', {name: '＋ Добавить кнопку', exact: true});
    expect(await addButton.evaluate(element => ({color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor}))).toEqual(service);
    const messageStyle = await addMessage.evaluate(element => ({color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor, border: getComputedStyle(element).borderTopStyle}));
    expect(messageStyle.color).not.toBe(service.color);
    expect(messageStyle.background).not.toBe(service.background);
    expect(messageStyle.border).toBe('solid');
    const addButtonBounds = (await addButton.boundingBox())!;
    const addMessageBounds = (await addMessage.boundingBox())!;
    expect(addMessageBounds.y - (addButtonBounds.y + addButtonBounds.height)).toBeGreaterThanOrEqual(20);
    for (const control of [addMessage, addButton]) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(40);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    const screenshot = `artifacts/screenshots/${info.project.name}-add-controls-${theme}.png`;
    await page.screenshot({path: screenshot});
    await info.attach(`add-controls-${theme}`, {path: screenshot, contentType: 'image/png'});
  }
  await assertNoOverflow(page);
});

test('editor help opens on hover or focus, pins on click and dismisses without changing the bot', async ({page}) => {
  await page.goto('/');
  const trigger = page.getByRole('button', {name: 'Как редактировать бота', exact: true});
  const help = page.getByTestId('editor-help');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.hover();
  await expect(help).toBeVisible();
  await expect(help).toHaveAttribute('role', 'tooltip');
  await expect(help).toContainText('Редактирование бота');
  await help.hover();
  await expect(help).toBeVisible();
  const bounds = (await help.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(15);
  expect(bounds.y).toBeGreaterThanOrEqual(15);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width - 15);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height - 15);
  await trigger.click();
  await page.locator('.chat-header .bot-heading').hover();
  await expect(help).toBeVisible();
  await page.locator('.chat-header .bot-heading').click();
  await expect(help).not.toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.focus();
  await expect(help).toBeVisible();
  await trigger.press('Escape');
  await expect(help).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.locator('[data-testid^="story-step-"]')).toHaveCount(1);
  await expect(page.getByRole('button', {name: '↶ Отменить', exact: true})).toBeDisabled();
  await assertNoOverflow(page);
});

test('Test message editing preserves pending replies and updates authored text across repeated occurrences', async ({page}) => {
  await page.goto('/');
  await page.clock.install({time: new Date('2026-09-07T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-09-07T12:00:01Z'));
  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  const bot = page.getByTestId('run-bot');
  const first = bot.first();
  const original = await first.locator('.message-text').textContent();
  await first.getByRole('button', {name: 'Посмотреть материал', exact: true}).press('Enter');
  const menu = page.getByTestId('message-context-menu');
  const editFirst = async () => {
    await first.locator('.message-text').click({button: 'right'});
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', {name: 'Редактировать сообщение', exact: true}).click();
    await page.clock.runFor(32);
    await expect(page.getByLabel('Текст сообщения', {exact: true})).toBeFocused();
  };
  await editFirst();
  await page.getByLabel('Текст сообщения', {exact: true}).fill('Правка, от которой отказались.');
  await page.getByLabel('Текст сообщения', {exact: true}).press('Escape');
  await expect(first.locator('.message-text')).toHaveText(original!);
  await expect(bot).toHaveCount(1);
  await first.locator('.message-text').dblclick();
  await page.clock.runFor(32);
  await expect(page.getByLabel('Текст сообщения', {exact: true})).toBeFocused();
  const saved = 'Сообщение исправлено прямо во время проверки.';
  await page.getByLabel('Текст сообщения', {exact: true}).fill(saved);
  await page.getByLabel('Текст сообщения', {exact: true}).press('ControlOrMeta+Enter');
  await expect(first.locator('.message-text')).toHaveText(saved);
  await expect(bot).toHaveCount(1);
  await page.clock.runFor(350);
  await expect(bot).toHaveCount(2);
  await expect(bot.last()).toContainText('Три шага');

  const composer = page.getByRole('textbox', {name: 'Сообщение', exact: true});
  await composer.fill('/start');
  await composer.press('Enter');
  await page.clock.runFor(350);
  await expect(bot).toHaveCount(3);
  await expect(bot.last().locator('.message-text')).toHaveText(saved);
  const transcriptSize = await page.locator('.run-message').count();
  await bot.last().locator('.message-text').click({button: 'right'});
  await menu.getByRole('menuitem', {name: 'Редактировать сообщение', exact: true}).click();
  await page.clock.runFor(32);
  const finalText = 'Одна правка — во всех повторениях этого сообщения.';
  const runEditor = page.getByLabel('Текст сообщения', {exact: true});
  await runEditor.dispatchEvent('compositionstart', {data: ''});
  await bot.nth(1).locator('.message-text').dispatchEvent('contextmenu', {bubbles: true, clientX: 150, clientY: 180});
  await expect(menu).toHaveCount(0);
  await expect(runEditor).toBeFocused();
  await runEditor.dispatchEvent('compositionend', {data: ''});
  await page.getByLabel('Текст сообщения', {exact: true}).fill(finalText);
  await page.getByLabel('Текст сообщения', {exact: true}).press('ControlOrMeta+Enter');
  await expect(first.locator('.message-text')).toHaveText(finalText);
  await expect(bot.last().locator('.message-text')).toHaveText(finalText);
  await expect(bot.nth(1)).toContainText('Три шага');
  await expect(page.locator('.run-message')).toHaveCount(transcriptSize);
  await expect(bot.last().getByRole('button', {name: 'Посмотреть материал', exact: true})).toBeEnabled();
  await page.getByRole('button', {name: 'В редактор', exact: true}).click();
  await expectAuthoredMessages(page.getByTestId('story-step-start'), [finalText]);
  const document = await exported(page);
  expect(document.content.messages[document.steps.start.messageIds[0]]).toBe(finalText);
  await assertNoOverflow(page);
});

test('Test navigation folds preceding messages and cancels pending replies; selected-screen start keeps the global entry', async ({page}, info) => {
  await page.goto('/');
  await page.clock.install({time: new Date('2026-09-07T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-09-07T12:00:01Z'));
  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  const bot = page.getByTestId('run-bot');
  const original = await bot.first().locator('.message-text').textContent();
  await bot.first().getByRole('button', {name: 'Посмотреть материал', exact: true}).press('Enter');
  await page.clock.runFor(100);
  await (await revealScreen(page, 'details')).click();
  const history = page.getByTestId('run-history');
  await expect(history).toBeVisible();
  await expect(history).not.toHaveAttribute('open', '');
  await expect(page.getByTestId('history-toggle')).toContainText('Предыдущие сообщения · 2');
  await expect(bot).toHaveCount(2);
  await expect(bot.first()).not.toBeVisible();
  await expect(bot.last().getByRole('button', {name: 'В меню', exact: true})).toBeEnabled();
  await captureReview(page, info, 'collapsed-history');
  const detailsText = await bot.last().locator('.message-text').textContent();
  await expect(page.getByTestId('run-user')).toHaveCount(1);
  await page.getByTestId('history-toggle').click();
  await expect(history).toHaveAttribute('open', '');
  await expect(bot.first().locator('.message-text')).toBeVisible();
  await expect(bot.first().locator('.message-text')).toHaveText(original!);
  await expect(bot.first().getByRole('button', {name: 'Посмотреть материал', exact: true})).toBeDisabled();
  await expect(history.locator('.run-message')).toHaveCount(2);
  await page.getByTestId('history-toggle').click();
  await expect(bot.first()).not.toBeVisible();
  await page.clock.runFor(1000);
  await expect(bot).toHaveCount(2);
  await expect(bot.last().locator('.message-text')).toHaveText(detailsText!);
  const composer = page.getByRole('textbox', {name: 'Сообщение', exact: true});
  await composer.fill('/start');
  await composer.press('Enter');
  await page.clock.runFor(350);
  await expect(bot).toHaveCount(3);
  await expect(bot.last().locator('.message-text')).toHaveText(original!);
  await page.getByRole('button', {name: 'В редактор', exact: true}).click();
  await selectScreen(page, 'details');
  await page.getByRole('button', {name: 'Настройки экрана', exact: true}).click();
  await page.getByRole('button', {name: 'Пройти с этого экрана', exact: true}).click();
  await expect(history).toHaveCount(0);
  await expect(bot).toHaveCount(1);
  await expect(bot.first().locator('.message-text')).toHaveText(detailsText!);
  await expect(page.getByTestId('run-user')).toHaveCount(0);
  await composer.fill('/start');
  await composer.press('Enter');
  await page.clock.runFor(350);
  await expect(bot).toHaveCount(2);
  await expect(bot.last().locator('.message-text')).toHaveText(original!);
  await page.getByRole('button', {name: 'В редактор', exact: true}).click();
  expect((await exported(page)).entryStepId).toBe('start');
  await assertNoOverflow(page);
});

test('Edit uses direct textareas while Test double-click edits bot bubbles from every free surface', async ({page}) => {
  await page.goto('/');
  const doubleClickVisibleTime = async (bubble: Locator) => {
    const bounds = await bubble.locator('.time-inner').boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.dblclick(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  };
  const authored = page.getByTestId('story-step-start').locator('.bubble').first();
  await expect(authored.locator('.message-editor')).toHaveCount(1);
  await authored.locator('.message-editor').click();
  await expect(authored.locator('.message-editor')).toBeFocused();
  await authored.locator('.message-editor').press('Escape');

  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  const tested = page.getByTestId('run-bot').first().locator('.bubble');
  await doubleClickVisibleTime(tested);
  await expect(page.getByLabel('Текст сообщения', {exact: true})).toBeFocused();
  await page.getByLabel('Текст сообщения', {exact: true}).press('Escape');
  await tested.locator('.message-text').dblclick();
  await expect(page.getByLabel('Текст сообщения', {exact: true})).toBeFocused();
  await page.getByLabel('Текст сообщения', {exact: true}).press('Escape');
  await assertNoOverflow(page);
});

test('the authoring screen stays vertically centered when its persistent textarea gains or loses focus', async ({page}) => {
  await page.goto('/');
  const scroller = page.getByTestId('chat-scroll');
  const story = scroller.locator('.chat-story');
  const bubble = page.getByTestId('story-step-start').locator('.bubble-content-wrapper').first();
  const geometry = async () => {
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const [scrollBounds, storyBounds, bubbleBounds] = await Promise.all([scroller.boundingBox(), story.boundingBox(), bubble.boundingBox()]);
    expect(scrollBounds).not.toBeNull();
    expect(storyBounds).not.toBeNull();
    expect(bubbleBounds).not.toBeNull();
    return {
      storyCenterDelta: storyBounds!.y + storyBounds!.height / 2 - (scrollBounds!.y + scrollBounds!.height / 2),
      bubbleCenterDelta: bubbleBounds!.y + bubbleBounds!.height / 2 - (scrollBounds!.y + scrollBounds!.height / 2),
      storyFits: storyBounds!.height <= scrollBounds!.height
    };
  };

  const idle = await geometry();
  if(idle.storyFits) expect(Math.abs(idle.storyCenterDelta)).toBeLessThanOrEqual(10);
  expect(Math.abs(idle.bubbleCenterDelta)).toBeLessThanOrEqual(16);
  await bubble.locator('.message-editor').focus();
  await expect(page.getByLabel('Текст сообщения', {exact: true})).toBeFocused();
  const editing = await geometry();
  expect(Math.abs(editing.bubbleCenterDelta - idle.bubbleCenterDelta)).toBeLessThanOrEqual(8);
  await page.getByLabel('Текст сообщения', {exact: true}).press('Escape');
  const finished = await geometry();
  expect(Math.abs(finished.bubbleCenterDelta - idle.bubbleCenterDelta)).toBeLessThanOrEqual(2);
  await assertNoOverflow(page);
});

test('screen names edit in the header and sidebar with Enter, blur and Escape, and stay synchronized during Test', async ({page}, info) => {
  await page.goto('/');
  const rename = page.locator('.screen-title-trigger');
  const headerInput = page.getByTestId('rename-header');
  await rename.click();
  await expect(headerInput).toBeFocused();
  await headerInput.fill('Приветствие');
  await headerInput.press('Enter');
  await expect(rename).toContainText('Приветствие');
  await rename.click();
  await headerInput.fill('Отменённое название');
  await headerInput.press('Escape');
  await expect(rename).toContainText('Приветствие');

  await sidebar(page);
  const row = page.getByTestId('step-nav-start');
  await expect(row).toContainText('Приветствие');
  await row.hover();
  await row.getByRole('button', {name: 'Переименовать экран 01 · Приветствие', exact: true}).click();
  const sidebarInput = page.getByTestId('rename-sidebar-start');
  await expect(sidebarInput).toBeFocused();
  await sidebarInput.fill('Тоже отменено');
  await sidebarInput.press('Escape');
  await expect(row).toContainText('Приветствие');
  await row.hover();
  await row.getByRole('button', {name: 'Переименовать экран 01 · Приветствие', exact: true}).click();
  await sidebarInput.fill('Начало диалога');
  await captureReview(page, info, 'sidebar-rename');
  await page.locator('.sidebar .brand strong').click();
  await expect(sidebarInput).toHaveCount(0);
  await expect(row).toContainText('Начало диалога');
  await closeSidebar(page);
  await expect(rename).toContainText('Начало диалога');
  await rename.click();
  await headerInput.fill('Имя перед переносом');
  const screen = page.getByTestId('story-step-start');
  await startDragging(page, screen.getByRole('button', {name: 'Посмотреть материал', exact: true}));
  await dropAtButton(page, screen.getByRole('button', {name: 'Открыть меню', exact: true}), 'after');
  await expect(rename).toContainText('Имя перед переносом');
  expect(await buttonRows(screen)).toEqual([['start-menu', 'start-offer']]);
  await page.getByRole('button', {name: '↶ Отменить', exact: true}).click();
  expect(await buttonRows(screen)).toEqual([['start-offer', 'start-menu']]);
  await expect(rename).toContainText('Имя перед переносом');
  await rename.click();
  await headerInput.dispatchEvent('compositionstart', {data: ''});
  await headerInput.fill('Незавершённый ввод');
  await expect(screen.locator('.message-editor')).toHaveCount(1);
  await expect(screen.getByRole('button', {name: 'Изменить текст сообщения', exact: true})).toHaveCount(0);
  await expect(headerInput).toHaveCount(1);
  await headerInput.dispatchEvent('compositionend', {data: ''});
  await headerInput.press('Escape');
  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  await rename.click();
  await headerInput.fill('Название в тесте');
  await headerInput.press('Enter');
  await expect(rename).toContainText('Название в тесте');
  await expect(page.getByTestId('run-bot')).toHaveCount(1);
  const document = await exported(page);
  expect(document.content.steps.start.title).toBe('Название в тесте');
  await sidebar(page);
  await expect(row).toContainText('Название в тесте');
  await closeSidebar(page);
  await page.getByRole('button', {name: 'В редактор', exact: true}).click();
  await expect(rename).toContainText('Название в тесте');
  await assertNoOverflow(page);
});

test('Test double-click edits a button without navigation and synchronizes its label, destination and color while preserving earlier actions', async ({page}, info) => {
  await page.goto('/');
  await page.clock.install({time: new Date('2026-09-07T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-09-07T12:00:01Z'));
  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  await page.clock.runFor(32);
  const bot = page.getByTestId('run-bot');
  const inspector = page.getByTestId('keyboard-inspector');
  const initialButton = bot.first().getByRole('button', {name: 'Посмотреть материал', exact: true});
  await initialButton.click();
  await page.clock.runFor(400);
  await expect(page.getByTestId('run-user')).toHaveCount(0);
  await physicalClickWithDetail(page, initialButton, 2);
  await expect(inspector).toBeVisible();
  await page.clock.runFor(1000);
  await expect(bot).toHaveCount(1);
  await expect(page.getByTestId('run-user')).toHaveCount(0);
  await inspector.getByLabel('Подпись', {exact: true}).fill('Открыть практику');
  await inspector.getByRole('combobox', {name: 'Куда перейти', exact: true}).selectOption('details');
  await inspector.getByRole('button', {name: 'Синий цвет', exact: true}).click();
  await captureReview(page, info, 'test-button-inspector');
  await inspector.getByRole('button', {name: 'Применить', exact: true}).click();
  const edited = bot.first().getByRole('button', {name: 'Открыть практику', exact: true});
  await expect(edited).toHaveAttribute('data-button-color', 'blue');
  await edited.click();
  await page.clock.runFor(501);
  await expect(page.getByTestId('run-user')).toHaveCount(1);
  // A historical button remains HTML-enabled for editing. Deliver the single
  // late second press, not a fresh two-press double-click sequence.
  await physicalClickWithDetail(page, edited, 2);
  await expect(inspector).toHaveCount(0);
  await expect(page.getByTestId('run-user')).toHaveCount(1);
  await page.clock.runFor(350);
  await expect(bot).toHaveCount(2);
  await expect(bot.last()).toContainText('Возьми одну реальную задачу');
  await expect(page.getByTestId('run-user').first().locator('.message-text')).toHaveText('Открыть практику');

  const composer = page.getByRole('textbox', {name: 'Сообщение', exact: true});
  await composer.fill('/start');
  await composer.press('Enter');
  await page.clock.runFor(350);
  await bot.last().getByRole('button', {name: 'Открыть практику', exact: true}).dblclick();
  await expect(inspector).toBeVisible();
  await inspector.getByLabel('Подпись', {exact: true}).fill('Другой текст');
  await inspector.getByRole('combobox', {name: 'Куда перейти', exact: true}).selectOption('material');
  await inspector.getByRole('button', {name: 'Зелёный цвет', exact: true}).click();
  await inspector.getByRole('button', {name: 'Применить', exact: true}).click();
  await expect(page.getByTestId('run-user').first().locator('.message-text')).toHaveText('Открыть практику');
  await expect(bot).toHaveCount(3);
  await expect(bot.first().getByRole('button', {name: 'Другой текст', exact: true})).toBeDisabled();
  const current = bot.last().getByRole('button', {name: 'Другой текст', exact: true});
  await expect(current).toHaveAttribute('data-button-color', 'green');
  await current.press('Enter');
  await page.clock.runFor(350);
  await expect(bot).toHaveCount(4);
  await expect(bot.last()).toContainText('Шаблон запроса');
  await page.getByRole('button', {name: 'В редактор', exact: true}).click();
  const saved = await exported(page);
  expect(saved.schemaVersion).toBe(5);
  expect(saved.buttons['start-offer']).toEqual({targetStepId: 'material', color: 'green'});
  expect(saved.content.buttons['start-offer']).toBe('Другой текст');
  expect(saved.messages['start-message'].rows.flatMap((row: {buttonIds: string[]}) => row.buttonIds)).toContain('start-offer');
  await assertNoOverflow(page);
});

test.describe('explicit plain-text copying', () => {
  test.use({clipboard: 'mock'});
  test('Copy writes exactly the selected literal text once, and visitor messages have no Edit action', async ({page}) => {
    await page.goto('/');
    const literal = '<b>Точный текст</b>\nВторая строка & символы';
    const editor = await focusAuthoredMessage(page.getByTestId('story-step-start'));
    await editor.fill(literal);
    await editor.press('ControlOrMeta+Enter');
    await page.clock.install({time: new Date('2026-09-08T12:00:00Z')});
    await page.clock.pauseAt(new Date('2026-09-08T12:00:01Z'));
    await page.getByRole('button', {name: 'Пройти', exact: true}).click();
    await page.clock.runFor(32);
    const first = page.getByTestId('run-bot').first();
    const menu = page.getByTestId('message-context-menu');
    const host = first.locator('.message-actions-host');
    await host.focus();
    await host.press('Shift+F10');
    await expect(menu.getByRole('menuitem', {name: 'Копировать текст', exact: true})).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(menu).toHaveCount(0);
    await expect(first.getByRole('button', {name: 'Посмотреть материал', exact: true})).toBeFocused();
    await host.focus();
    await host.press('Shift+F10');
    await page.keyboard.press('Shift+Tab');
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('button', {name: 'В редактор', exact: true})).toBeFocused();
    await first.locator('.message-text').click({button: 'right'});
    await expect(menu).toBeVisible();
    expect(await page.evaluate(() => window.__shellIsolation().copies)).toEqual([]);
    await menu.getByRole('menuitem', {name: 'Копировать текст', exact: true}).click();
    await expect(menu.getByRole('status')).toContainText('Текст скопирован');
    expect(await page.evaluate(() => window.__shellIsolation().copies)).toEqual([literal]);
    await expect(first.locator('.message-text')).toHaveText(literal);
    await expect(first.locator('.message-text b')).toHaveCount(0);
    await expect(page.getByTestId('run-bot')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    const dismiss = page.getByRole('button', {name: 'Закрыть уведомление', exact: true});
    if(await dismiss.isVisible()) await dismiss.click();

    const visitor = '<script>Это обычный текст посетителя</script>';
    await page.getByRole('textbox', {name: 'Сообщение', exact: true}).fill(visitor);
    await page.getByRole('textbox', {name: 'Сообщение', exact: true}).press('Enter');
    await page.locator('[data-message-kind="text"]').last().locator('.message-text').click({button: 'right'});
    await expect(menu.getByRole('menuitem', {name: 'Редактировать сообщение', exact: true})).toHaveCount(0);
    await menu.getByRole('menuitem', {name: 'Копировать текст', exact: true}).click();
    await expect(menu.getByRole('status')).toContainText('Текст скопирован');
    expect(await page.evaluate(() => window.__shellIsolation().copies)).toEqual([literal, visitor]);
    await expect(page.getByLabel('Текст сообщения', {exact: true})).toHaveCount(0);
    await assertNoOverflow(page);
  });
});

test('emulated touch opens message actions on hold and edits through Done without copying on release', async ({page, browserName}, info) => {
  test.skip(browserName !== 'chromium' || info.project.name !== 'chromium-375x812', 'The browser-generated phone hold gesture is exercised once with Chromium CDP.');
  await page.setViewportSize({width: 375, height: 480});
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 1});
  await page.goto('/');
  await page.clock.install({time: new Date('2026-09-07T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-09-07T12:00:01Z'));
  await page.getByRole('button', {name: 'Пройти', exact: true}).click();
  // Let the initial transcript auto-scroll finish before measuring a held touch.
  // Advancing it after touchStart would correctly cancel the hold as scrolling.
  await page.clock.runFor(32);
  const bubble = page.getByTestId('run-bot').first();
  const text = bubble.locator('.message-text');
  await text.scrollIntoViewIfNeeded();
  await page.clock.runFor(32);
  const rect = (await text.boundingBox())!;
  const x = rect.x + rect.width / 2;
  const y = Math.max(90, Math.min(rect.y + rect.height / 2, 370));
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', clientX = 0, clientY = 0) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{x: clientX, y: clientY, id: 1, radiusX: 3, radiusY: 3, force: 1}]
  });
  await touch('touchStart', x, y);
  await page.clock.runFor(550);
  const menu = page.getByTestId('message-context-menu');
  await expect(menu).toBeVisible();
  await touch('touchEnd');
  expect(await page.evaluate(() => window.__shellIsolation().copies)).toEqual([]);
  const edit = (await menu.getByRole('menuitem', {name: 'Редактировать сообщение', exact: true}).boundingBox())!;
  await touch('touchStart', edit.x + edit.width / 2, edit.y + edit.height / 2);
  await touch('touchEnd');
  await page.clock.runFor(32);
  await expect(page.getByLabel('Текст сообщения', {exact: true})).toBeFocused();
  await page.getByLabel('Текст сообщения', {exact: true}).fill('Отредактировано после удержания на телефоне.');
  await bubble.getByRole('button', {name: 'Готово', exact: true}).click();
  await expect(bubble.locator('.message-text')).toHaveText('Отредактировано после удержания на телефоне.');
  await expect(page.getByTestId('run-bot')).toHaveCount(1);
  const button = bubble.getByRole('button', {name: 'Посмотреть материал', exact: true});
  await button.scrollIntoViewIfNeeded();
  await page.clock.runFor(32);
  const buttonBounds = (await button.boundingBox())!;
  await touch('touchStart', buttonBounds.x + buttonBounds.width / 2, buttonBounds.y + buttonBounds.height / 2);
  await page.clock.runFor(550);
  const inspector = page.getByTestId('keyboard-inspector');
  await expect(inspector).toBeVisible();
  await touch('touchEnd');
  await page.clock.runFor(1000);
  await expect(page.getByTestId('run-user')).toHaveCount(0);
  await expect(page.getByTestId('run-bot')).toHaveCount(1);
  await inspector.getByLabel('Подпись', {exact: true}).fill('Материал с телефона');
  await inspector.getByRole('button', {name: 'Применить', exact: true}).click();
  await expect(bubble.getByRole('button', {name: 'Материал с телефона', exact: true})).toBeVisible();
  expect(await page.evaluate(() => window.__shellIsolation().copies)).toEqual([]);
  await cdp.detach();
  await assertNoOverflow(page);
});
