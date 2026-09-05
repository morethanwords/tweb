import type {MessageEntity} from '@layer';

export const MESSAGE_LINK_ENTITY_TYPES: ReadonlySet<MessageEntity['_']> = new Set([
  'messageEntityMention',
  'messageEntityMentionName',
  'messageEntityHashtag',
  'messageEntityCashtag',
  'messageEntityUrl',
  'messageEntityTextUrl',
  'messageEntityEmail',
  'messageEntityBankCard'
]);

export const MESSAGE_LINK_ENTITY_ATTRIBUTE = 'data-message-link-entity';
export const MESSAGE_LINK_ENTITY_SELECTOR = `[${MESSAGE_LINK_ENTITY_ATTRIBUTE}]`;

export function markMessageLinkEntity(element: HTMLElement, entity: MessageEntity) {
  if(element.tagName === 'A' && MESSAGE_LINK_ENTITY_TYPES.has(entity._)) {
    element.setAttribute(MESSAGE_LINK_ENTITY_ATTRIBUTE, '');
  }
}

export default function filterDisabledEntities(
  entities: MessageEntity[],
  disabledEntities: ReadonlySet<MessageEntity['_']>
) {
  return entities.filter((entity) => !disabledEntities.has(entity._));
}
