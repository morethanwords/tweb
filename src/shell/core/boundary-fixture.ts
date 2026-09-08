import {documentBytes, validateDocument} from './document';
import {createFixture} from './fixture';
import {defaultTestSeed} from './values';
import {ShellLimits, type ShellDocument} from './types';
import type {Fixture} from './headless';

export const boundaryStepId = (index: number) => `screen-${index}`;
export const boundaryMessageId = (screen: number, index = 0) => `message-${screen}-${index}`;
export const boundaryButtonId = (screen: number, index = 0) => `button-${screen}-${index}`;

/** Reproducible structural limit fixture; every screen owns five independent message keyboards. */
export function createBoundaryDocument(targetBytes = ShellLimits.documentBytes - 512): ShellDocument {
  if(!Number.isInteger(targetBytes) || targetBytes > ShellLimits.documentBytes) throw new Error('Invalid document byte target');
  const document = createFixture();
  document.id = 'boundary-document'; document.entryStepId = boundaryStepId(0); document.nextStepNumber = 101;
  document.folderOrder = ['start-folder', 'menu-folder'];
  document.folders = {
    'start-folder': {stepIds: Array.from({length: 49}, (_, index) => boundaryStepId(index)), fallbackStepId: boundaryStepId(98)},
    'menu-folder': {stepIds: Array.from({length: 49}, (_, index) => boundaryStepId(index + 49)), fallbackStepId: boundaryStepId(99)}
  };
  document.steps = {}; document.blocks = {}; document.messages = {}; document.buttons = {};
  document.content = {folders: {'start-folder': {title: 'Старт'}, 'menu-folder': {title: 'Меню'}}, steps: {}, messages: {}, buttons: {}};
  for(let step = 0; step < 100; step++) {
    const stepId = boundaryStepId(step); document.steps[stepId] = {number: step + 1, blockIds: []};
    document.content.steps[stepId] = {title: `Screen ${step + 1}`};
    for(let index = 0; index < 5; index++) {
      const messageId = boundaryMessageId(step, index), buttonId = boundaryButtonId(step, index), blockId = `block-${step}-${index}`;
      document.steps[stepId].blockIds.push(blockId); document.blocks[blockId] = {id: blockId, type: 'message', messageId};
      document.messages[messageId] = {rows: [{id: `row-${step}-${index}`, buttonIds: [buttonId]}]};
      document.buttons[buttonId] = {color: 'default', transition: {type: 'screen', screenId: boundaryStepId((step + 1) % 100)}};
      document.content.messages[messageId] = `Boundary message ${step + 1}.${index + 1}. `;
      document.content.buttons[buttonId] = `Open screen ${(step + 1) % 100 + 1}`;
    }
  }
  const remaining = targetBytes - documentBytes(document);
  if(remaining < 0) throw new Error('Byte target is smaller than the structural fixture');
  const ids = Object.keys(document.messages), each = Math.floor(remaining / ids.length);
  for(const id of ids) document.content.messages[id] += 'x'.repeat(each);
  document.content.messages[ids[0]] += 'x'.repeat(targetBytes - documentBytes(document));
  return validateDocument(document);
}

export function explicitBoundaryFixture(document: ShellDocument): Fixture {
  const seed = defaultTestSeed(document);
  for(const definition of Object.values(document.variables)) if(['system', 'event'].includes(definition.scope)) delete seed.variables[definition.id];
  return {startAt: 0, ...seed};
}
