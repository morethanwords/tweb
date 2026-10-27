import type {MyDocument} from '@appManagers/appDocsManager';

/**
 * A document its row plays (an audio element with the player's controls) rather than one it
 * downloads.
 */
export default function isPlayableDocument(doc: Pick<MyDocument, 'type'>) {
  return doc?.type === 'audio' || doc?.type === 'voice' || doc?.type === 'round';
}
