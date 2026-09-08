import {test, expect, type Page} from '@playwright/test';
import {createFixture} from '../../src/shell/core/fixture';
import {applyOperations} from '../../src/shell/semantic/operations';
import type {DocumentCommand} from '../../src/shell/core/types';

async function fixture(page: Page, options: {verification?: unknown; report?: Record<string, unknown>} = {}) {
  let document = createFixture(), revisionNumber = 0;
  let verification = options.verification ?? null;
  const commands: DocumentCommand[][] = [];
  const reportRequests: Record<string, unknown>[] = [];
  await page.route('**/api/session', route => route.fulfill({json: {csrfToken: 'test-session'}}));
  await page.route('**/api/document', route => route.fulfill({json: {ok: true, data: {document, revision: `test:${revisionNumber}`, revisionNumber, epoch: 'test', verification}}}));
  await page.route('**/api/command', async route => {
    const request = route.request().postDataJSON();
    if(request.name === 'execution_explain' && options.report) {
      reportRequests.push(request.args);
      await route.fulfill({json: {ok: true, data: {...options.report, assertions: request.args.offset === 0 ? options.report.assertions : [], nextOffset: request.args.offset === 0 ? 20 : null}}}); return;
    }
    if(request.name !== 'manual_change' || request.args.baseRevision !== `test:${revisionNumber}`) {
      await route.fulfill({json: {ok: false, error: {code: 'REVISION_CONFLICT', message: 'Сценарий изменился.'}}}); return;
    }
    expect(route.request().headers()['x-csrf-token']).toBe('test-session');
    commands.push(request.args.operations);
    document = applyOperations(document, request.args.operations).document; revisionNumber++; verification = {outcome: 'unverified', cases: []};
    await route.fulfill({json: {ok: true, data: {revision: `test:${revisionNumber}`, revisionNumber, changed: true}}});
  });
  return {commands, reportRequests, current: () => document, remote(operations: DocumentCommand[]) {document = applyOperations(document, operations).document; revisionNumber++; verification = {outcome: 'unverified', cases: []};}};
}
async function showPanel(page: Page) {
  const open = page.getByRole('button', {name: 'Открыть навигацию'});
  if(await open.isVisible()) await open.click();
}

test('confirmed remote changes reach bubbles; an inline edit sends one typed operation', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const state = await fixture(page); await page.goto('/');
  const message = page.getByTestId('editor-start').first();
  await expect(message).toBeVisible();
  await expect(page.getByText('Открываем сценарий…', {exact: true})).toHaveCount(0);
  state.remote([{type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'Изменено через MCP'}]);
  await expect(message).toHaveValue('Изменено через MCP');
  await message.fill('Моя правка'); await message.press('ControlOrMeta+Enter');
  await expect.poll(() => state.current().content.messages['start-message']).toBe('Моя правка');
  expect(state.commands).toEqual([[{type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'Моя правка'}]]);
  expect(errors).toEqual([]);
});

test('a competing update keeps the visible draft until the author explicitly retries', async ({page}) => {
  const state = await fixture(page); await page.goto('/');
  const message = page.getByTestId('editor-start').first();
  await message.fill('Мой незавершённый текст');
  state.remote([{type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'Другая версия'}]);
  await expect(page.getByTestId('companion-status')).toHaveText('Есть другая версия');
  await expect(message).toHaveValue('Мой незавершённый текст');
  expect(state.commands).toHaveLength(0);
  await message.press('ControlOrMeta+Enter');
  await showPanel(page); await page.getByRole('button', {name: 'Повторить правку'}).click();
  await expect.poll(() => state.current().content.messages['start-message']).toBe('Мой незавершённый текст');
  await expect(page.getByTestId('companion-status')).toHaveText('Сохранено локально');
  expect(state.commands).toHaveLength(1);
});

test('failed checks show expected/actual and specific error before loading more evidence', async ({page}) => {
  const state = await fixture(page, {verification: {outcome: 'failed', cases: [{title: 'Выдача материала', outcome: 'failed', reportId: 'report'}]}, report: {
    reportId: 'report', assertions: [{id: 'material', passed: false, expected: {type: 'message', messageId: 'material-message', contains: null, min: 1, max: 1}, actual: 0}],
    observations: [], error: {code: 'MATERIAL_MISSING', details: {message: 'Материал не был показан'}}, oversizedDetails: [], evidenceTruncated: false
  }});
  await page.goto('/'); await showPanel(page);
  await page.getByText('Есть ошибки', {exact: true}).click();
  await page.getByRole('button', {name: 'Выдача материала · Есть ошибки'}).click();
  const failure = page.getByTestId('companion-failed-condition');
  await expect(failure).toContainText('Ожидалось'); await expect(failure.locator('dd').nth(0)).toHaveText('1'); await expect(failure.locator('dd').nth(1)).toHaveText('0');
  await expect(page.getByTestId('companion-report-error')).toHaveText('MATERIAL_MISSING · Материал не был показан');
  expect(state.reportRequests).toHaveLength(1);
  await page.getByText('Данные проверки', {exact: true}).click(); expect(state.reportRequests).toHaveLength(1);
  await page.getByRole('button', {name: 'Следующая часть отчёта'}).click();
  await expect.poll(() => state.reportRequests.length).toBe(2); expect(state.reportRequests[1].offset).toBe(20);
});

test('saved checks do not certify an unfinished or conflicting draft', async ({page}) => {
  const state = await fixture(page, {verification: {outcome: 'passed', cases: [{title: 'Старт', outcome: 'passed', reportId: 'report'}]}});
  await page.goto('/'); await showPanel(page);
  await expect(page.getByText('Пройдены', {exact: true})).toBeVisible();
  const close = page.getByRole('button', {name: 'Закрыть навигацию'});
  if(await close.isVisible()) await close.click();
  const message = page.getByTestId('editor-start').first();
  await message.fill('Непроверенный текст');
  await expect(page.getByText('Изменения ещё не проверены', {exact: true})).toHaveCount(1);
  state.remote([{type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'Другая версия'}]);
  await expect(page.getByTestId('companion-status')).toHaveText('Есть другая версия');
  await expect(page.getByText('Изменения ещё не проверены', {exact: true})).toHaveCount(1);
  await showPanel(page);
  await page.getByText('Изменения ещё не проверены', {exact: true}).click();
  await expect(page.getByRole('button', {name: 'Старт · Пройдены'})).toBeDisabled();
});

test('a report is dismissed when another confirmed version replaces its document', async ({page}) => {
  const state = await fixture(page, {verification: {outcome: 'failed', cases: [{title: 'Материал', outcome: 'failed', reportId: 'report'}]}, report: {
    reportId: 'report', assertions: [], observations: [], error: {code: 'MISSING', details: {message: 'Старая ошибка'}}, oversizedDetails: [], evidenceTruncated: false
  }});
  await page.goto('/'); await showPanel(page);
  await page.getByText('Есть ошибки', {exact: true}).click();
  await page.getByRole('button', {name: 'Материал · Есть ошибки'}).click();
  await expect(page.getByTestId('companion-report-error')).toHaveText('MISSING · Старая ошибка');
  state.remote([{type: 'set_step_title', stepId: 'start', title: 'Новая версия'}]);
  await expect(page.getByText('Ещё не проверен', {exact: true})).toBeVisible();
  await expect(page.locator('.companion-report')).toHaveCount(0);
});
