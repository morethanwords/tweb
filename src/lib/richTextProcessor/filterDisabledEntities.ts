import type {MessageEntity} from '@layer';

export const MESSAGE_LINK_ENTITY_TYPES: ReadonlySet<MessageEntity['_']> = new Set([
  'messageEntityMention',
  'messageEntityMentionName',
  'messageEntityHashtag',
  'messageEntityCashtag',
  'messageEntityUrl',
  'messageEntityTextUrl',
  'messageEntityEmail',
  'messageEntityBankCard',
  // an inline page button acts like a link; where links are off, its label stays as plain text
  'messageEntityRichButton'
]);

export const MESSAGE_LINK_ENTITY_ATTRIBUTE = 'data-message-link-entity';
export const MESSAGE_LINK_ENTITY_SELECTOR = `[${MESSAGE_LINK_ENTITY_ATTRIBUTE}]`;

/**
 * Whether an entity is one of `types`: by its own type, or as the link it is — a rich text's phone or email
 * has a target of its own, whatever it reads, which makes it a text link to that number or address too
 * (tdesktop's CustomUrl), hidden where text links are.
 */
function isEntityOfTypes(entity: MessageEntity, types: ReadonlySet<MessageEntity['_']>) {
  return types.has(entity._) || (
    (entity as MessageEntity & {richTextTarget?: string}).richTextTarget !== undefined &&
    types.has('messageEntityTextUrl')
  );
}

export function markMessageLinkEntity(element: HTMLElement, entity: MessageEntity) {
  if(element.tagName === 'A' && isEntityOfTypes(entity, MESSAGE_LINK_ENTITY_TYPES)) {
    element.setAttribute(MESSAGE_LINK_ENTITY_ATTRIBUTE, '');
  }
}

export default function filterDisabledEntities(
  entities: MessageEntity[],
  disabledEntities: ReadonlySet<MessageEntity['_']>
) {
  return entities.filter((entity) => !isEntityOfTypes(entity, disabledEntities));
}
