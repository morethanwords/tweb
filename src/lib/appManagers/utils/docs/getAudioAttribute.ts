import {DocumentAttribute} from '@layer';
import type {MyDocument} from '@appManagers/appDocsManager';

/**
 * A document's `documentAttributeAudio` — the one carrying title, performer, duration, waveform
 * and the voice flag. Every reader of those went looking for it by hand, cast included.
 */
export default function getAudioAttribute(doc: MyDocument) {
  return doc?.attributes?.find(
    (attribute) => attribute._ === 'documentAttributeAudio'
  ) as DocumentAttribute.documentAttributeAudio;
}
