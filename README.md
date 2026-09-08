# Robochat Semantic Engine + MCP

Локальный companion хранит подтверждённый сценарий, принимает правки из редактора и MCP,
проверяет неизменяемые версии и применяет подготовленный кандидат после обязательных тестов.
Визуальная оболочка и headless-проверки используют общее ядро исполнения v6.

## Запуск companion

С Node 22.23.2 и pnpm 11.16.0:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run semantic:build
pnpm run semantic:serve
```

Редактор: `http://127.0.0.1:3130/`. MCP Streamable HTTP: `http://127.0.0.1:3130/mcp`.
Занятый порт приводит к ошибке запуска. Сервер загружает только проверенный артефакт.
Браузер получает локальную сессию автоматически. Перезагрузка страницы читает актуальный
сценарий сервера; перезапуск процесса начинает новую сессию с эталонным ботом.

Сборку и gate можно выполнять в Docker. Готовый сервер запускайте Node 22.23.2
на рабочей машине: он слушает её `127.0.0.1:3130`. Проверка адреса выполняется с этой
же машины. В текущем Docker Desktop запуск контейнера с `--network host` не открыл
этот адрес рабочему браузеру, поэтому локальный запуск использует проверенный Node
из закреплённого build image напрямую.

Launcher создаёт локальный bearer credential в `.semantic-local/capability` с правами `0600`.
MCP-клиент передаёт его через заголовок `Authorization: Bearer …`. Значение не помещается
в URL, исходники или логи. Процесс запуска и MCP-клиент должны принадлежать одному
пользователю ОС. Поддерживаются протоколы 2026-07-28 и 2025-11-25.

## Проверяемый путь через MCP

1. `bot_context({})` возвращает botId, revision, реальные возможности и обязательные сценарии.
2. `bot_prepare_change` принимает эту ревизию, уникальный requestKey и типизированные операции.
   Он подготавливает отдельный документ и запускает все пять обязательных сценариев примера.
3. `bot_apply_change` принимает changeId и исходную ревизию; применяет только готовый кандидат.

Пример операции:

```json
{
  "type": "set_message_text",
  "stepId": "start",
  "messageId": "start-message",
  "text": "Привет! Здесь материалы, идеи и эксперименты. Выберите, с чего начать."
}
```

Для поиска и диагностики доступны `bot_search`, `bot_inspect`, `bot_validate`,
`bot_test` и `execution_explain`. Схемы всех восьми инструментов публикуются через MCP discovery.
`bot_test` запускает именованные обязательные проверки либо ad hoc cases с явными `given`,
`steps` и `expect`; результат содержит runId, reportId и версии для продолжения.
Сценарий начинается до первого входа: отправляйте `/start` обычным `send_text`.

Повтор запроса с тем же requestKey и телом получает прежний результат. Другие параметры
с тем же ключом отклоняются. При потере ответа не создавайте новый ключ.
Непринятый тестовый ввод требует явного ожидания соответствующего receipt.
`passed` подтверждает только названные утверждения конкретного снимка. `failed`, `blocked`
и `observed` не разрешают применение кандидата. Ad hoc проверки не заменяют обязательный набор.
Для бота без обязательного набора возвращается `TESTS_NOT_CONFIGURED`.

`execution_explain` выдаёт страницы фактов; большие значения доступны через `detail`
с kind/index/offset и hash содержимого. Промежуточные нарушения проверяются после каждого
исполненного блока. Будущие ожидания продвигаются явно через `advance_by`.
Инвариант `always` для `whole_run` задаётся при исходном запуске: продолжение проверяет
новые инварианты только для `segment`; для всей истории заново запустите исходную fixture.
Ретроспективная проверка инварианта возвращает `ASSERTION_HISTORY_UNAVAILABLE`.
Wait последовательный: переход к fallback заменяет его. Code исполняется в новой QuickJS VM.
Telegram, внешние HTTP, платежи и независимые напоминания не выполняются.

В редакторе **Проверить сценарии** использует тот же сервис. Текст и кнопки можно менять
в preview; такая правка делает прежнюю проверку исторической. Конкурирующая правка
сохраняет локальный незавершённый текст и требует явного выбора, какую версию продолжать.

## Проверка реализации

```sh
pnpm run semantic:verify
```

Команда включает прежний `shell:verify`, общий typecheck/lint/unit gate, MCP и fault tests,
обе production-сборки, Chromium/WebKit smoke редактора с MCP, сетевую изоляцию и измерение
предельного документа. Результаты и hash точного дерева записываются в `semantic-artifacts/`.
Артефакты работающего сервера не пересобираются: проверенную сборку копируют в отдельный
каталог выпуска. Предыдущий локальный выпуск можно сохранить для отката.

Основные модули: `src/shell/core/` — исполнение; `src/shell/semantic/document-service.ts` —
документы/CAS; `test-service.ts` — проверки/отчёты; `compiler.ts` — производный индекс;
`registry.ts` — идемпотентность; `transport/` — MCP и browser API; `companion-bridge.ts` —
синхронизация редактора. `notices/SOURCE-SNAPSHOT.json` фиксирует перенесённую основу.

## Исходная автономная оболочка

Следующие разделы описывают отдельный offline entry (`shell:*`), сохранённый для
проверки визуального редактора без companion. Его ограничения сети остаются отдельными.

Standalone, client-only visual editor extracted from Telegram Web K at
[`4a82cc7667477751cfc1b0dcec75db539c797a03`](https://github.com/morethanwords/tweb/tree/4a82cc7667477751cfc1b0dcec75db539c797a03).
GPL-3.0-only; original LICENSE and retained dependency notices accompany the source.

## Try the shell

Choose a screen from the chat-style sidebar and edit its message directly in the bubble. Each screen supports up to ten ordered
messages, each with its own keyboard. Click a button to choose its destination.
Rename a screen directly in the chat header or with the sidebar row's pencil.
An added message stays only when its first edit contains text; leaving it blank or
canceling discards the insertion. Adding it and writing its text form one undo action.
Drag buttons within a row, into another row or into a new row. On touchscreens hold
the button before moving it; Alt+arrow keys provide an alternative to dragging. The button inspector
contains the label, destination and four color swatches, with apply, cancel and delete actions.
Editing guidance is available from the information icon in the header.
Start and end badges follow the actual scenario links.
Use **Пройти бота** to walk the branch. Screen settings include **Пройти с этого экрана**
to start a fresh test from that screen without changing the bot's entry.
In Test, selecting a sidebar screen appends its messages immediately and activates
all its keyboards; earlier messages collapse behind an expandable history row.
The full transcript stays in order and any previously pending reply is canceled.
**В редактор** restores the selected authoring screen.
The folder rail starts with **Старт** and **Меню**. Selecting a folder filters its
always-visible screen list without changing the conversation. Every folder owns a
permanent **Если непонятно** screen pinned last; edit its messages and buttons normally.
Unknown text and commands transition to that screen in the currently active bot
screen's folder. The fallback never inherits the folder merely browsed by the author.
In Edit, add or rename folders and move ordinary screens using **Папка экрана** in
screen settings. A folder can be deleted after its ordinary screens are moved away,
provided no remaining button or global entry refers to its fallback. Fallback screens
cannot be removed or moved individually. An empty fallback blocks starting a test.
In Test, type a message and send with Enter (Shift+Enter adds a line). While the bot
is typing, another message stays in the composer until its reply can be accepted.
Send `/start` to append the command and the entry screen to the conversation;
history and input focus remain. The header restart action starts a fresh transcript.
Double-click a bot message to edit it. Right-click a test message (long-press on
touchscreens) to copy its text or edit an authored bot message. Explicit text edits
update the author document and every occurrence of that message in the test;
Escape restores both. Double-click, right-click or long-press a test button to edit
its label, destination or color. These explicit changes update the author document
and test together; an already accepted reply keeps its original target, and earlier
visitor actions keep their original text. A single click follows the button after
the double-click window; Enter and Space follow it immediately.
The starting example has five ordinary screens and two folder fallbacks, with a branch and return paths.

Changes exist only in the current browser session. Reload starts the example again.
No Telegram login, network requests, browser storage, backend execution or real
AI service is present. Three explicitly selected local AI demonstrations exercise
the callback boundary. A freeform prompt without an adapter leaves the document intact.

## Inline logic

The composer under the chat adds a message to the current screen: type the text and send
it, exactly as in Test mode; a trailing empty message takes the text instead. **Добавить элемент** opens a compact chooser:
question, condition, action and wait. Code creation is temporarily hidden. Each editor holds a draft; Apply creates
one undo operation, Cancel discards it. The whole header toggles the card; folding
retains unfinished input without applying it. Drag grips reorder elements
without changing their explicit destinations. Insertion controls sit between elements.

Conditions compare typed variables or constants and take the first matching case.
A button with **Продолжить ниже** waits for a click before running the next block.
Questions accept text, numbers or choices. Set/increment and the fixed local orders
catalog change real test data. HTTP is an explicit fixture: configuration is saved,
but no request is sent. Retry resumes only the failed activation.

Waits use virtual time, dates, named test events or user input. **Проверка логики**
shows actual execution, current variables, next-run seed data and test event controls.
Skipping a wait advances to its next due time. A new screen, /start or restart retires
previous pending work. Test structure is a snapshot; explicit text/keyboard edits are
supported, while logic changes apply on the next run.

CodeMirror loads only when its dialog opens. The real TypeScript 6 compiler and
QuickJS 0.32 run in a guarded dedicated worker. `run(ctx)` receives readonly scoped
JSON and returns `{outcome, data?}`; named outcomes map to visible transitions.
Optional data goes to one declared result variable. No host/network/DB capabilities
enter the VM. Fixed 32 MiB WASM and 16 MiB QuickJS heap, 500 ms interpretation and a 2 s
worker lifetime are verified in code tests. Compiler JavaScript memory is not part
of the QuickJS heap cap. Details/provenance: `src/shell/code/README.md`.

Flow Map, Call Flow and semantic AI preview are deferred. No placeholder commands
for these appear in the editor. All state remains in memory; reload is a fresh session.

## Reproducible environment

- Node 22.23.2: `node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`
- pnpm 11.16.0; use `pnpm install --frozen-lockfile --ignore-scripts`.
- Browser checks require Playwright 1.61.1 Chromium and WebKit with their OS libraries.
- Vendored Solid 1.9.9 browser/web/store aliases are shared by Vite and tests; TS
  resolves their matching declaration files. The registry Solid tool peer is never bundled.

`scripts/Dockerfile.verify` supplies one complete verification environment. It pins
Node 22.23.2 from the Debian Node image and Playwright 1.61.1 by immutable digests.
The Alpine image above was used for the first isolated build; the verification
image uses glibc so WebKit can run. Use a separate dependency volume for each libc:

```sh
docker build -f scripts/Dockerfile.verify -t robochat-shell-verify .
docker run --rm --ipc=host -v "$PWD:/workspace" -v robochat-shell-verify-deps:/workspace/node_modules robochat-shell-verify sh -c 'pnpm install --frozen-lockfile --ignore-scripts && pnpm shell:verify'
```

Run `pnpm shell:verify` for typecheck, lint, unit tests, production build, static
artifact checks, both browsers, reference comparison and forbidden-API attempt checks.
Browser tests run in parallel on half the cores (`SHELL_BROWSER_WORKERS=1` makes them
serial); `pnpm shell:browser:quick` covers desktop and phone Chromium only for routine
edits, while `shell:verify` keeps the full two-browser, four-viewport matrix.
`scripts/release.sh` rebuilds in that container, cuts `releases/<manifest sha16>/` and swaps the
local serving container on `127.0.0.1:3120` (`--check quick|full|none`).
The server uses `pnpm shell:serve --dir <artifact-directory> --manifest <manifest-file>` (see script usage)
and binds localhost port 3120 strictly. Only files in the generated manifest are served.
Build to `dist`, then copy a completed artifact to a separate release directory before
serving it; never build over the directory currently being served.

## Contracts and ownership

`src/shell/core/types.ts` defines the versioned document and limits.
`core/document.ts` validates and canonically serializes it. `core/editor.ts` owns
revision checks, text transactions and bounded undo; `core/simulator.ts` owns
occurrence-based local progression. `controller.ts` owns effects and request cancellation.
The native components only render data and dispatch intents. `Inspector.tsx` edits a
keyboard draft, committing one validated operation on Apply.

AI adapters implement `AiAdapter` in `core/types.ts`, passed as `App` props.
The caller receives an isolated snapshot and AbortSignal. A completion applies only
at its captured document identity and revision. Production CSP remains `connect-src
'none'`; this contract is an in-process callback, not permission to add network calls.

Export JSON with Ctrl/Cmd+Shift+E. Schema v6 contains `folderOrder`, per-folder
ordinary `stepIds` and one `fallbackStepId`, stable monotonic screen numbers,
ordered block IDs per screen, message references and their own keyboard rows, and separate plain text
in `content`. Every screen belongs to exactly one folder; there is no parallel global
screen-order or fallback-settings source. Version 5 documents migrate through the same validator to v6; export always writes v6.
Folder and screen order govern presentation. Execution uses `entryStepId`, explicit
button/logic transitions and the active screen's folder fallback. A test captures this topology;
explicit Test content/keyboard edits remain supported. Null targets remain visibly
unfinished. Import UI is not part of this version.

A transcript, pending timer, AI state, editor state and undo never enter exported JSON.
Structural commands require the current revision. Activations require the exact current
bot occurrence in the latest screen batch and its own button; timer completion also
requires the current run and pending-reply identity.

## Visual provenance

`reference/upstream-manifest.json` records original file hashes before extraction.
`reference/upstream/` is frozen reference source; it is never imported by the app.
The separate reference fixture exercises native DOM and SCSS without Telegram startup.
Candidate screenshots are compared against that independent fixture, not auto-updated
candidate baselines. Inspect the reference manifest/provenance for retained assets.

The automated short viewport checks do not prove real phone keyboard behavior.
Real iOS/Android keyboard acceptance must be exercised on a physical device.

## Limits

The shared limits allow 100 screens, 500 authored messages, 500 buttons and a
1 MiB serialized document. A test conversation holds up to 201 messages; a screen's
reply batch is accepted in full or rejected. Undo retains at most 20 finished edits
within an 8 MiB budget. Performance measurements from the earlier single-message
schema do not establish performance for this version. Blocks are capped at 30 per
screen and 500 total; automatic execution pauses after 100 consecutive blocks.
The initial JS budget is 250 KiB gzip; lazy code tools have a separate 4 MiB gzip
budget. Build measurements are generated in `artifacts/build-manifest.json`.
