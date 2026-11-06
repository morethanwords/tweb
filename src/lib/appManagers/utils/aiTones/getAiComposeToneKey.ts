import type {AiComposeTone} from '@layer';

/** How a request names a tone (`toneNameOrId`): a default one by its name, any other by its id */
export default function getAiComposeToneKey(tone: AiComposeTone) {
  return tone._ === 'aiComposeToneDefault' ? tone.tone : tone.id.toString();
}
