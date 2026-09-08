import {validateDocument} from '../core/document';
import {allStepIds, stepFolderId} from '../core/navigation';
import {blockTransitionEntries} from '../core/blocks';
import {interpolateText, OrdersColumns} from '../core/values';
import type {Block, Condition, JsonValue, ShellDocument, Transition, ValueSource} from '../core/types';

export type EntityKind = 'bot' | 'folder' | 'screen' | 'block' | 'message' | 'button' | 'row' | 'variable' | 'table' | 'event' | 'case' | 'outcome' | 'choice';
export interface EntityRef {kind: EntityKind; id: string; parentId?: string}
export interface SemanticEntity {
  ref: EntityRef; key: string; label: string; text: string; screenId?: string;
  content: unknown; navigation: unknown; execution: unknown;
}
export interface SemanticEdge {
  kind: 'contains' | 'transition' | 'fallback' | 'entry' | 'reads' | 'writes' | 'waits_for' | 'uses_table';
  from: EntityRef; to: EntityRef; label?: string;
}
export interface SemanticDiagnostic {
  code: 'EMPTY_MESSAGE' | 'UNASSIGNED_BUTTON' | 'UNKNOWN_VARIABLE' | 'OPAQUE_CODE_DEPENDENCIES' | 'UNREACHABLE_SCREEN' | 'POSSIBLE_CYCLE' | 'UNHANDLED_ERROR' | 'WAIT_WITHOUT_TIMEOUT';
  severity: 'warning' | 'info'; entity: EntityRef; message: string;
}
export interface SemanticSnapshot {
  schemaVersion: 1; documentId: string; entities: SemanticEntity[]; edges: SemanticEdge[];
  diagnostics: SemanticDiagnostic[]; opaqueCode: EntityRef[];
}
export interface SemanticSearchHit {
  ref: EntityRef; key: string; label: string; screenId?: string; preview: string;
  score: number; matchedFields: string[]; contentComplete: false;
}
export interface SemanticChange {
  type: 'added' | 'removed' | 'modified'; ref: EntityRef; label: string;
  categories: ('content' | 'navigation' | 'execution')[];
  before: SemanticEntity | null; after: SemanticEntity | null;
}

export function entityKey(ref: EntityRef): string {return JSON.stringify([ref.kind, ref.id, ref.parentId ?? null]);}
function stable(value: unknown): string {
  if(Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if(value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
const ref = (kind: EntityKind, id: string, parentId?: string): EntityRef => parentId === undefined ? {kind, id} : {kind, id, parentId};

/** Disposable, detached semantic projection of one validated v6 document. No LLM or runtime execution. */
export function compileSemantic(input: ShellDocument): SemanticSnapshot {
  const document = validateDocument(input);
  const snapshot: SemanticSnapshot = {schemaVersion: 1, documentId: document.id, entities: [], edges: [], diagnostics: [], opaqueCode: []};
  const entities = new Map<string, SemanticEntity>();
  const edges = new Set<string>();
  function entity(reference: EntityRef, label: string, content: unknown, navigation: unknown, execution: unknown, screenId?: string, text = ''): EntityRef {
    const key = entityKey(reference);
    if(!entities.has(key)) {
      const entry: SemanticEntity = {ref: reference, key, label, text, content, navigation, execution, ...(screenId ? {screenId} : {})};
      entities.set(key, entry); snapshot.entities.push(entry);
    }
    return reference;
  }
  function edge(kind: SemanticEdge['kind'], from: EntityRef, to: EntityRef, label?: string): void {
    const entry: SemanticEdge = {kind, from, to, ...(label === undefined ? {} : {label})};
    const key = stable(entry);
    if(!edges.has(key)) {edges.add(key); snapshot.edges.push(entry);}
  }
  function diagnostic(code: SemanticDiagnostic['code'], at: EntityRef, message: string, severity: SemanticDiagnostic['severity'] = 'warning'): void {
    snapshot.diagnostics.push({code, severity, entity: at, message});
  }
  function usage(from: EntityRef, variableId: string | null, kind: 'reads' | 'writes'): void {
    if(variableId === null) return;
    if(Object.hasOwn(document.variables, variableId)) edge(kind, from, ref('variable', variableId));
    else diagnostic('UNKNOWN_VARIABLE', from, `Переменная ${variableId} не определена.`);
  }
  function source(from: EntityRef, value: ValueSource): void {if(value.type === 'variable') usage(from, value.variableId, 'reads');}
  function textReads(from: EntityRef, text: string): void {
    // Recognize tokens with the same interpolation implementation as the simulator.
    interpolateText(text, new Proxy<Record<string, JsonValue>>({}, {get(_target, key) {
      if(typeof key === 'string') usage(from, key, 'reads');
      return '';
    }}));
  }
  function condition(from: EntityRef, value: Condition): void {
    usage(from, value.variableId, 'reads');
    if(value.operator !== 'exists') source(from, value.value);
  }
  function transition(from: EntityRef, value: Transition, nextBlockId: string | undefined, label?: string): void {
    if(value.type === 'screen') edge('transition', from, ref('screen', value.screenId), label);
    else if(value.type === 'continue' && nextBlockId) edge('transition', from, ref('block', nextBlockId), label);
  }
  const bot = entity(ref('bot', document.id), document.bot.title, document.bot, {folderOrder: document.folderOrder}, {entryStepId: document.entryStepId});
  edge('entry', bot, ref('screen', document.entryStepId), '/start');
  for(const definition of Object.values(document.variables)) {
    const at = entity(ref('variable', definition.id), definition.label, {label: definition.label}, null, {scope: definition.scope, valueType: definition.valueType});
    edge('contains', bot, at);
  }
  for(const folderId of document.folderOrder) {
    const folder = document.folders[folderId];
    const at = entity(ref('folder', folderId), document.content.folders[folderId].title, document.content.folders[folderId], {stepIds: folder.stepIds}, {fallbackStepId: folder.fallbackStepId});
    edge('contains', bot, at); edge('fallback', at, ref('screen', folder.fallbackStepId), 'Неизвестный ввод внутри папки');
  }
  for(const screenId of allStepIds(document)) {
    const screen = document.steps[screenId], folderId = stepFolderId(document, screenId);
    const folder = document.folders[folderId];
    const at = entity(ref('screen', screenId), document.content.steps[screenId].title, document.content.steps[screenId],
      {folderId, number: screen.number}, {blockIds: screen.blockIds, fallbackStepId: folder.fallbackStepId}, screenId);
    edge('contains', ref('folder', folderId), at); edge('entry', at, ref('block', screen.blockIds[0]));
    edge('fallback', at, ref('screen', folder.fallbackStepId), 'Неизвестный ввод');
    for(const [index, blockId] of screen.blockIds.entries()) {
      const block = document.blocks[blockId], nextBlockId = screen.blockIds[index + 1];
      const blockRef = entity(ref('block', blockId), block.type === 'code' ? block.name : block.type,
        block.type === 'code' ? {name: block.name} : null, {screenId}, blockExecution(block), screenId);
      edge('contains', at, blockRef);
      if(block.type === 'message' || block.type === 'ask') {
        const messageId = block.messageId, text = document.content.messages[messageId];
        const messageRef = entity(ref('message', messageId), text.split('\n')[0], {text}, {rowIds: document.messages[messageId].rows.map(row => row.id)}, null, screenId, text);
        edge('contains', blockRef, messageRef);
        if(!text.trim()) diagnostic('EMPTY_MESSAGE', messageRef, 'Сообщение пустое.');
        textReads(messageRef, text);
        for(const row of document.messages[messageId].rows) {
          const rowRef = entity(ref('row', row.id), 'Ряд кнопок', null, {buttonIds: row.buttonIds}, null, screenId);
          edge('contains', messageRef, rowRef);
          for(const buttonId of row.buttonIds) {
            const button = document.buttons[buttonId];
            const buttonRef = entity(ref('button', buttonId), document.content.buttons[buttonId], {label: document.content.buttons[buttonId], color: button.color},
              {messageId, rowId: row.id}, {ownerBlockId: blockId, transition: button.transition, ...(button.transition?.type === 'continue' ? {continueBlockId: nextBlockId ?? null} : {})}, screenId, document.content.buttons[buttonId]);
            edge('contains', rowRef, buttonRef);
            textReads(buttonRef, document.content.buttons[buttonId]);
            if(button.transition) transition(buttonRef, button.transition, nextBlockId, document.content.buttons[buttonId]);
            else diagnostic('UNASSIGNED_BUTTON', buttonRef, 'Назначение кнопки не настроено.');
          }
        }
      }
      if(block.type === 'message') transition(blockRef, {type: 'continue'}, nextBlockId, 'Следующий блок');
      else if(block.type === 'decision') {
        for(const item of block.cases) {
          const caseRef = entity(ref('case', item.id, blockId), item.label, {label: item.label}, null, {condition: item.condition, transition: item.transition}, screenId);
          edge('contains', blockRef, caseRef); condition(caseRef, item.condition);
          transition(caseRef, item.transition, nextBlockId, item.label);
        }
        transition(blockRef, block.otherwise, nextBlockId, 'Иначе');
      } else if(block.type === 'code') {
        snapshot.opaqueCode.push(blockRef);
        diagnostic('OPAQUE_CODE_DEPENDENCIES', blockRef, 'Чтения внутри TypeScript не анализируются. Контекст кода доступен только для чтения; результат и исходы объявлены явно.', 'info');
        usage(blockRef, block.resultVariableId, 'writes');
        for(const outcome of block.outcomes) {
          const outcomeRef = entity(ref('outcome', outcome.id, blockId), outcome.name, null, null, outcome, screenId);
          edge('contains', blockRef, outcomeRef); transition(outcomeRef, outcome.transition, nextBlockId, outcome.name);
        }
      } else {
        for(const exit of blockTransitionEntries(block)) transition(blockRef, exit.transition, nextBlockId, exit.label);
        if(block.type === 'ask') {
          usage(blockRef, block.variableId, 'writes');
          for(const choice of block.choices) {
            const choiceRef = entity(ref('choice', choice.id, blockId), choice.label, {label: choice.label}, null, {value: choice.value}, screenId);
            edge('contains', blockRef, choiceRef);
          }
        } else if(block.type === 'action') {
          const action = block.action;
          if(action.type === 'set') {usage(blockRef, action.variableId, 'writes'); source(blockRef, action.value);}
          else if(action.type === 'increment') {usage(blockRef, action.variableId, 'reads'); usage(blockRef, action.variableId, 'writes');}
          else {
            usage(blockRef, action.resultVariableId, 'writes');
            if(action.type !== 'http_mock') {
              const tableRef = entity(ref('table', action.table), action.table, null, null, {columns: OrdersColumns, localOnly: true});
              edge('uses_table', blockRef, tableRef);
              if('where' in action) {edge('reads', blockRef, tableRef); Object.values(action.where).forEach(value => source(blockRef, value));}
              if('values' in action) {edge('writes', blockRef, tableRef); Object.values(action.values).forEach(value => source(blockRef, value));}
            }
          }
          if(block.error === null) diagnostic('UNHANDLED_ERROR', blockRef, 'Ошибка действия остановит прохождение без отдельного перехода.', 'info');
        } else if(block.type === 'wait') {
          if(block.wait.type === 'event') {
            const eventRef = entity(ref('event', 'event', blockId), block.wait.name, null, null, {localOnly: true, name: block.wait.name}, screenId);
            edge('waits_for', blockRef, eventRef);
          } else if(block.wait.type === 'input') usage(blockRef, block.wait.variableId, 'writes');
          if((block.wait.type === 'event' || block.wait.type === 'input') && block.timeout === null) diagnostic('WAIT_WITHOUT_TIMEOUT', blockRef, 'Ожидание события или ввода не имеет тайм-аута.', 'info');
        }
      }
    }
  }
  addGraphDiagnostics(snapshot);
  snapshot.entities.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  snapshot.edges.sort((a, b) => stable(a) < stable(b) ? -1 : stable(a) > stable(b) ? 1 : 0);
  return snapshot;
}

function blockExecution(block: Block): unknown {
  switch(block.type) {
    case 'ask': return {...block, choices: block.choices.map(({id, value}) => ({id, value}))};
    case 'decision': return {...block, cases: block.cases.map(({id, condition, transition}) => ({id, condition, transition}))};
    case 'code': {const {name: _name, ...execution} = block; return execution;}
    default: return block;
  }
}

/** Conservative reachability: every declared outcome and possible fallback remains a candidate. */
function addGraphDiagnostics(snapshot: SemanticSnapshot): void {
  const map = new Map(snapshot.entities.map(entity => [entity.key, entity]));
  const adjacency = new Map<string, Set<string>>();
  for(const edge of snapshot.edges) {
    if(!['contains', 'transition', 'fallback', 'entry'].includes(edge.kind)) continue;
    // Bot/folder containment is organization, never an executable route into every screen.
    if(edge.kind === 'contains' && (edge.from.kind === 'bot' || edge.from.kind === 'folder' || edge.from.kind === 'screen')) continue;
    const from = entityKey(edge.from), to = entityKey(edge.to);
    if(!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from)!.add(to);
  }
  const visited = new Set<string>(), queue = [entityKey(ref('bot', snapshot.documentId))];
  while(queue.length) {
    const key = queue.pop()!;
    if(visited.has(key)) continue;
    visited.add(key);
    for(const next of adjacency.get(key) ?? []) queue.push(next);
  }
  for(const entity of snapshot.entities) {
    if(entity.ref.kind === 'screen' && !visited.has(entity.key)) snapshot.diagnostics.push({code: 'UNREACHABLE_SCREEN', severity: 'warning', entity: entity.ref, message: 'Нет структурного пути от /start. Прямой запуск из редактора остаётся возможен.'});
  }
  // Detect authored cycles conservatively; this does NOT claim a hot loop or feasible condition path.
  const screenEdges = new Map<string, Set<string>>();
  for(const edge of snapshot.edges) {
    if(edge.kind !== 'transition' || edge.to.kind !== 'screen') continue;
    const screenId = map.get(entityKey(edge.from))?.screenId;
    if(!screenId) continue;
    if(!screenEdges.has(screenId)) screenEdges.set(screenId, new Set());
    screenEdges.get(screenId)!.add(edge.to.id);
  }
  for(const screenId of screenEdges.keys()) {
    const seen = new Set<string>(), pending = [...screenEdges.get(screenId)!];
    while(pending.length) {
      const target = pending.pop()!;
      if(target === screenId) {
        snapshot.diagnostics.push({code: 'POSSIBLE_CYCLE', severity: 'info', entity: ref('screen', screenId), message: 'Есть цикл переходов; наличие ожиданий и выполнимость условий не доказаны.'});
        break;
      }
      if(seen.has(target)) continue;
      seen.add(target); pending.push(...screenEdges.get(target) ?? []);
    }
  }
}

export function searchSemantic(snapshot: SemanticSnapshot, query: string, limit = 20): SemanticSearchHit[] {
  if(typeof query !== 'string' || query.length > 512 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Search requires a query of at most 512 characters and a limit from 1 to 100.');
  const normalized = query.normalize('NFKC').toLowerCase().trim();
  if(!normalized) return [];
  const tokens = normalized.split(/\s+/).slice(0, 20);
  const symbolMatches = new Map<string, string[]>();
  const entitiesByKey = new Map(snapshot.entities.map(entity => [entity.key, entity]));
  for(const edge of snapshot.edges) {
    if((edge.kind === 'reads' || edge.kind === 'writes' || edge.kind === 'uses_table' || edge.kind === 'waits_for') &&
      (edge.to.id.toLowerCase() === normalized || edge.kind === 'waits_for' && entitiesByKey.get(entityKey(edge.to))?.label.toLowerCase() === normalized)) {
      const key = entityKey(edge.from);
      symbolMatches.set(key, [...symbolMatches.get(key) ?? [], edge.kind]);
    }
  }
  const hits: SemanticSearchHit[] = [];
  for(const entity of snapshot.entities) {
    const label = entity.label.normalize('NFKC').toLowerCase(), text = entity.text.normalize('NFKC').toLowerCase();
    const matchedFields: string[] = []; let score = 0;
    if(entity.ref.id.toLowerCase() === normalized) {score += 100; matchedFields.push('id');}
    if(label === normalized) {score += 90; matchedFields.push('label');}
    else if(label.includes(normalized)) {score += 60; matchedFields.push('label');}
    if(text.includes(normalized)) {score += 30; matchedFields.push('text');}
    const usages = symbolMatches.get(entity.key);
    if(usages) {score += 70; matchedFields.push(...new Set(usages));}
    if(!score && tokens.every(token => `${entity.ref.id} ${label} ${text}`.toLowerCase().includes(token))) {score = 10; matchedFields.push('tokens');}
    if(score) hits.push({ref: {...entity.ref}, key: entity.key, label: entity.label.slice(0, 160), ...(entity.screenId ? {screenId: entity.screenId} : {}),
      preview: (entity.text || entity.label).slice(0, 240), score, matchedFields, contentComplete: false});
  }
  return hits.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).slice(0, limit);
}

export function inspectSemantic(snapshot: SemanticSnapshot, reference: EntityRef): {
  entity: SemanticEntity; incoming: SemanticEdge[]; outgoing: SemanticEdge[]; diagnostics: SemanticDiagnostic[]; contentComplete: true;
} | null {
  const key = entityKey(reference), entity = snapshot.entities.find(item => item.key === key);
  if(!entity) return null;
  return structuredClone({entity, incoming: snapshot.edges.filter(edge => entityKey(edge.to) === key),
    outgoing: snapshot.edges.filter(edge => entityKey(edge.from) === key),
    diagnostics: snapshot.diagnostics.filter(item => entityKey(item.entity) === key), contentComplete: true as const});
}

export function semanticDiff(before: ShellDocument, after: ShellDocument): SemanticChange[] {
  if(before.id !== after.id) throw new Error('Cannot compare different documents.');
  const old = new Map(compileSemantic(before).entities.map(entity => [entity.key, entity]));
  const next = new Map(compileSemantic(after).entities.map(entity => [entity.key, entity]));
  const changes: SemanticChange[] = [];
  for(const key of [...new Set([...old.keys(), ...next.keys()])].sort()) {
    const left = old.get(key) ?? null, right = next.get(key) ?? null;
    const categories = (['content', 'navigation', 'execution'] as const).filter(category => stable(left?.[category]) !== stable(right?.[category]));
    if(!categories.length && left && right) continue;
    const entity = right ?? left!;
    changes.push({type: left === null ? 'added' : right === null ? 'removed' : 'modified', ref: entity.ref, label: entity.label, categories: [...categories], before: left, after: right});
  }
  return changes;
}
