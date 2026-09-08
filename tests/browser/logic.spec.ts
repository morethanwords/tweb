import type {Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {test, expect, assertNoOverflow} from './isolation';

async function select(page: Page, id: string) {
  if((page.viewportSize()?.width ?? 1280) < 900) await page.getByRole('button', {name: 'Открыть навигацию', exact: true}).click();
  const item = page.getByTestId(`step-nav-${id}`);
  if(!await item.count()) {
    for(const tab of await page.locator('[data-testid^="folder-tab-"]').all()) {await tab.click(); if(await item.count()) break;}
  }
  await item.click();
}
async function add(page: Page, kind: string) {
  await page.locator('.screen-add-actions').getByTestId('add-element').click();
  await expect(page.getByTestId('add-element-code')).toHaveCount(0);
  await page.getByTestId(`add-element-${kind}`).click();
  return page.locator('.logic-card.is-expanded');
}
async function apply(page: Page) {await page.getByTestId('apply-logic-block').click(); await expect(page.locator('.logic-card.is-expanded')).toHaveCount(0);}
async function text(page: Page, value: string) {
  const editor = page.locator('.story-step .message-editor').first();
  await editor.fill(value); await editor.press('ControlOrMeta+Enter');
}
async function rename(page: Page, value: string) {
  await page.locator('.screen-title-trigger').click();
  await page.getByTestId('rename-header').fill(value); await page.getByTestId('rename-header').press('Enter');
}
async function exportDocument(page: Page) {
  const downloaded = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+Shift+E');
  const path = await (await downloaded).path();
  const dismiss = page.getByRole('button', {name: 'Закрыть уведомление', exact: true});
  if(await dismiss.isVisible()) await dismiss.click();
  return JSON.parse(await readFile(path!, 'utf8'));
}
async function run(page: Page) {await page.locator('.header-mode').click();}

test('purchase authored in existing screens branches, debits once and advances virtual wait', async ({page}, info) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(10_000);
  await page.goto('/');
  await expect(page.locator('.logic-card')).toHaveCount(0);
  await select(page, 'offer'); await rename(page, 'Premium'); await text(page, 'Premium открыт. Баланс: {{user.balance}}');
  let card = await add(page, 'wait');
  await card.getByRole('combobox', {name: 'После ожидания', exact: true}).selectOption('screen:material'); await apply(page);
  await select(page, 'material'); await rename(page, 'Reminder'); await text(page, 'Напоминание: попробуйте Premium ещё раз.');
  await select(page, 'details'); await rename(page, 'Balance'); await text(page, 'Недостаточно средств. Баланс: {{user.balance}}');
  await select(page, 'start'); await text(page, 'Premium стоит 1000 ₽');
  await page.locator('[data-button-id="start-offer"]').click();
  await page.getByLabel('Подпись', {exact: true}).fill('Купить');
  await page.getByRole('combobox', {name: 'Куда перейти', exact: true}).selectOption('continue');
  await page.getByRole('button', {name: 'Применить', exact: true}).click();
  card = await add(page, 'decision');
  await card.getByRole('combobox', {name: 'Иначе', exact: true}).selectOption('screen:details'); await apply(page);
  card = await add(page, 'action');
  await card.getByRole('combobox', {name: 'После выполнения', exact: true}).selectOption('screen:offer'); await apply(page);
  await assertNoOverflow(page);
  await page.screenshot({path: `artifacts/screenshots/${info.project.name}-logic-author.png`, fullPage: true});
  await run(page);
  await expect(page.getByTestId('run-bot')).toHaveCount(1);
  await page.locator('[data-button-id="start-offer"]').click();
  await expect(page.getByTestId('run-bot').last()).toContainText('Premium открыт. Баланс: 500');
  await expect(page.getByTestId('advance-logic-time')).toBeVisible();
  await page.getByTestId('advance-logic-time').click();
  await expect(page.getByTestId('run-bot').last()).toContainText('Напоминание');
  await page.getByText('Проверка логики', {exact: false}).click();
  await expect(page.getByTestId('logic-trace')).toContainText('1500');
  await page.getByText('Данные нового теста', {exact: true}).click();
  await page.locator('.logic-test-tools').getByLabel('Значение', {exact: true}).fill('500');
  await page.getByRole('button', {name: 'Для следующего теста', exact: true}).click();
  await page.getByRole('button', {name: 'Начать заново', exact: true}).click();
  await page.locator('[data-button-id="start-offer"]').click();
  await expect(page.getByTestId('run-bot').last()).toContainText('Недостаточно средств. Баланс: 500');
  await expect(page.getByTestId('run-bot').filter({hasText: 'Premium открыт'})).toHaveCount(0);
  await assertNoOverflow(page);
});

test('Ask validates actual visitor input, preserves its value in a later bubble and keeps schema export', async ({page}) => {
  page.setDefaultTimeout(10_000);
  await page.goto('/');
  const card = await add(page, 'ask');
  await card.getByLabel('Вопрос бота').fill('Сколько вам лет?');
  await card.getByRole('combobox', {name: 'Тип ответа', exact: true}).selectOption('number');
  await card.getByText('Настройки ответа', {exact: true}).click();
  await card.getByRole('combobox', {name: 'Сохранить ответ', exact: true}).selectOption('user.age');
  const questionCard = page.getByTestId((await card.getAttribute('data-testid'))!);
  await card.locator('.logic-card-trigger').click();
  await expect(questionCard.locator('.bubble .message-text')).toHaveText('Сколько вам лет?');
  await questionCard.getByRole('button', {name: 'Развернуть вопрос'}).click();
  await expect(card.getByLabel('Вопрос бота')).toHaveValue('Сколько вам лет?');
  await apply(page);
  const composer = page.getByRole('textbox', {name: 'Сообщение', exact: true});
  await composer.fill('Ваш возраст: {{user.age}}'); await composer.press('Enter');
  await expect(composer).toHaveValue('');
  await run(page);
  await expect(page.getByTestId('run-bot').last()).toContainText('Сколько вам лет?');
  await page.getByRole('textbox', {name: 'Сообщение', exact: true}).fill('не число');
  await page.getByRole('button', {name: 'Отправить сообщение'}).click();
  await expect(page.getByTestId('run-bot').last()).toContainText('Сколько вам лет?');
  await expect(page.locator('.inline-notice.error')).toBeVisible();
  await page.getByRole('textbox', {name: 'Сообщение', exact: true}).fill('25');
  await page.getByRole('button', {name: 'Отправить сообщение'}).click();
  await expect(page.getByTestId('run-bot').last()).toContainText('Ваш возраст: 25');
  await page.getByTestId('run-bot').last().locator('.bubble-content').dblclick();
  const raw = page.locator('.run-message .message-editor');
  await expect(raw).toHaveValue('Ваш возраст: {{user.age}}');
  await raw.fill('Возраст гостя: {{user.age}}'); await raw.press('ControlOrMeta+Enter');
  await expect(page.getByTestId('run-bot').last()).toContainText('Возраст гостя: 25');
  await run(page);
  const saved = await exportDocument(page);
  expect(saved.schemaVersion).toBe(6);
  const blocks = saved.steps.start.blockIds.map((id: string) => saved.blocks[id]);
  expect(blocks.map((block: {type: string}) => block.type)).toEqual(['message', 'ask', 'message']);
  expect(blocks[1].variableId).toBe('user.age');
  expect(saved.content.messages[blocks[2].messageId]).toBe('Возраст гостя: {{user.age}}');
  expect(saved).not.toHaveProperty('trace');
});

// Code creation is temporarily hidden by the owner; compiler/runtime coverage stays active.
test.skip('real TypeScript in isolated worker validates, chooses declared branch and returns readonly data', async ({page}) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(10_000);
  await page.goto('/');
  const card = await add(page, 'code');
  await card.getByRole('combobox', {name: 'Продолжить', exact: true}).first().selectOption('screen:offer');
  await card.getByRole('combobox', {name: 'Продолжить', exact: true}).nth(1).selectOption('screen:details');
  await card.getByRole('button', {name: 'Открыть редактор кода'}).click();
  await expect(page.getByRole('dialog', {name: 'Редактор TypeScript'})).toBeVisible();
  const editor = page.getByTestId('code-source');
  await editor.fill('export default async function run(ctx: RoboContext) {\n  return {outcome: ctx.user.balance >= 1000 ? "success" : "insufficient_balance"};\n}');
  await page.getByRole('button', {name: 'Проверить код', exact: true}).click();
  await expect(page.locator('.code-editor-validation')).toContainText('Ошибок TypeScript нет.', {timeout: 10_000});
  await assertNoOverflow(page);
  if((page.viewportSize()?.width ?? 1280) < 900) {
    // visualViewport-only shrink emulates keyboard geometry, not a physical keyboard.
    await page.evaluate(() => {
      const viewport = window.visualViewport!;
      Object.defineProperty(viewport, 'height', {configurable: true, get: () => 260});
      Object.defineProperty(viewport, 'offsetTop', {configurable: true, get: () => 30});
      viewport.dispatchEvent(new Event('resize'));
    });
    await expect.poll(async () => {
      const bounds = await page.getByRole('button', {name: 'Готово', exact: true}).boundingBox();
      return !!bounds && bounds.y >= 30 && bounds.y + bounds.height <= 291;
    }).toBe(true);
    await page.evaluate(() => {
      const viewport = window.visualViewport!;
      Reflect.deleteProperty(viewport, 'height'); Reflect.deleteProperty(viewport, 'offsetTop');
      viewport.dispatchEvent(new Event('resize'));
    });
  }
  await page.getByRole('button', {name: 'Готово', exact: true}).click();
  await apply(page);
  await run(page);
  await expect(page.getByTestId('run-bot').last()).toContainText('Три шага', {timeout: 10_000});
  await expect(page.locator('.inline-notice.error')).toHaveCount(0);
  await page.getByText('Проверка логики', {exact: false}).click();
  await expect(page.getByTestId('logic-trace')).toContainText('success');
});

test('block drop uses release geometry after the conversation scrolls', async ({page}) => {
  test.skip(page.viewportSize()?.width !== 1280, 'One desktop geometry per browser exercises scrolling during a held drag.');
  await page.goto('/');
  await text(page, Array.from({length: 50}, (_, index) => `Строка ${index + 1}`).join('\n'));
  await add(page, 'action'); await apply(page);
  await add(page, 'wait'); await apply(page);
  const before = await exportDocument(page);
  const actionId = before.steps.start.blockIds.find((id: string) => before.blocks[id].type === 'action');
  const waitId = before.steps.start.blockIds.find((id: string) => before.blocks[id].type === 'wait');
  const grip = page.getByTestId(`block-grip-${actionId}`);
  await grip.scrollIntoViewIfNeeded();
  const handle = await grip.boundingBox();
  const wait = await page.getByTestId(`logic-block-${waitId}`).boundingBox();
  expect(handle).not.toBeNull(); expect(wait).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(wait!.x + wait!.width / 2, wait!.y + wait!.height * .8, {steps: 5});
  await expect(page.locator('[data-logic-drop="after"]')).toHaveCount(1);
  await page.getByTestId('chat-scroll').evaluate(element => {element.scrollTop = 0;});
  await page.mouse.up();
  const after = await exportDocument(page);
  expect(after.steps.start.blockIds.indexOf(actionId)).toBeLessThan(after.steps.start.blockIds.indexOf(waitId));
});

test('HTTP fixture fails visibly and retry resumes only that action; unused drafts cancel without export', async ({page}) => {
  page.setDefaultTimeout(10_000);
  await page.goto('/');
  let card = await add(page, 'decision');
  await card.getByRole('button', {name: 'Отмена', exact: true}).click();
  await expect(page.locator('.logic-card')).toHaveCount(0);
  card = await add(page, 'action');
  await card.getByRole('combobox', {name: 'Действие', exact: true}).selectOption('http_mock');
  await card.getByText('Запрос: заголовки и тело', {exact: true}).click();
  const body = card.getByRole('textbox', {name: 'Тело запроса · JSON', exact: true});
  await body.fill('{"payment":');
  await card.getByRole('combobox', {name: 'Метод', exact: true}).selectOption('PUT');
  await expect(body).toHaveValue('{"payment":');
  const retainedCard = page.getByTestId((await card.getAttribute('data-testid'))!);
  await body.evaluate(element => element.setAttribute('data-draft-identity', 'original'));
  await retainedCard.locator('.logic-card-chevron').click();
  await expect(retainedCard.locator('.logic-card-trigger')).toHaveAttribute('aria-expanded', 'false');
  await expect(body).toHaveCount(0);
  const beforeApply = await exportDocument(page);
  expect(Object.values(beforeApply.blocks).some((block: unknown) => (block as {type: string}).type === 'action')).toBe(false);
  await retainedCard.getByRole('button', {name: 'Развернуть действие'}).press('Enter');
  await expect(body).toHaveAttribute('data-draft-identity', 'original');
  await expect(body).toHaveValue('{"payment":');
  await expect(body).toHaveAttribute('aria-invalid', 'true');
  await retainedCard.locator('.logic-card-trigger').click();
  const composer = page.getByRole('textbox', {name: 'Сообщение', exact: true});
  await composer.fill('Сообщение после незавершённой правки'); await composer.press('Enter');
  await expect(composer).toHaveValue('Сообщение после незавершённой правки');
  await expect(retainedCard.locator('.logic-card-trigger')).toHaveAttribute('aria-expanded', 'true');
  await expect(body).toHaveValue('{"payment":');
  await expect(page.locator('.notice[role="status"]')).toContainText('Сначала примените или отмените');
  await page.getByRole('button', {name: 'Закрыть уведомление', exact: true}).click();
  await card.getByText('Запрос: заголовки и тело', {exact: true}).click();
  await page.getByTestId('apply-logic-block').click();
  await expect(card).toBeVisible();
  await expect(body).toHaveAttribute('aria-invalid', 'true');
  await body.fill('{"payment":1000}');
  await card.getByLabel('Сбоев перед успехом').fill('1');
  await card.getByRole('combobox', {name: 'После выполнения', exact: true}).selectOption('screen:offer');
  await apply(page);
  await run(page);
  await expect(page.getByTestId('retry-logic-block')).toBeVisible();
  await expect(page.locator('.inline-notice.error')).toContainText('500');
  await page.getByTestId('retry-logic-block').click();
  await expect(page.getByTestId('run-bot').last()).toContainText('Три шага');
  await expect(page.getByTestId('run-bot')).toHaveCount(2);
  await expect(page.getByTestId('retry-logic-block')).toHaveCount(0);
});
