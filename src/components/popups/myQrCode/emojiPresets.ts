import type {ReadingManagers} from '@lib/managers';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';

/**
 * The emoji anyone may put on a QR code, Premium or not: custom emoji of the set `RestrictedEmoji`
 * (`QrEmojiPanel.PRESETS`, three rows of seven). Slot 4 is the set's snowflake once the set is known.
 */
export const PRESET_EMOJI_SET = 'RestrictedEmoji';
const PRESET_SNOW_SLOT = 4;
export const PRESET_EMOJI_IDS = [
  '5449505950283078474', '5420315771991497307', '5373141891321699086', '5373026167722876724', '5435957248314579621', '5440354006335495210', '5436040291507247633',
  '5445284980978621387', '5442983582882601962', '5409008750893734809', '5371017798065592581', '5472030678633684592', '5467583879948803288', '5471952986970267163',
  '5415696465945173620', '5397915559037785261', '5283020991981693429', '5283051451889756068', '5282816560128336499', '5465449362807070392', '5470012829983580233'
] as DocId[];

type PresetSet = {
  documents: {id: DocId | string}[],
  packs?: {emoticon: string, documents: (DocId | string)[]}[]
};

/** The presets, with the snowflake of the set in place of slot 4 when the set has one among its documents */
export function resolvePresetIds(set?: PresetSet): DocId[] {
  const ids = [...PRESET_EMOJI_IDS];
  const known = new Set<string>((set?.documents || []).map((document) => String(document.id)));
  const snow = set?.packs?.find((pack) => pack.emoticon.replace(/\uFE0F/g, '') === '\u2744' && pack.documents?.length);
  const snowId = snow && String(snow.documents[0]) as DocId;
  if(snowId && known.has(String(snowId))) ids[PRESET_SNOW_SLOT] = snowId;
  return ids;
}

export async function loadPresetIds(managers: ReadingManagers): Promise<DocId[]> {
  try {
    return resolvePresetIds(await managers.appStickersManager.getStickerSet(PRESET_EMOJI_SET) as PresetSet);
  } catch{
    // no such set (another server): the presets stand as they are, each resolved on its own
    return resolvePresetIds();
  }
}

/* What was put on a code lately, newest first; Android keeps it in its settings */

const APPLIED_KEY = 'qr_applied_emoji';
const APPLIED_MAX = PRESET_EMOJI_IDS.length;

const appliedKey = () => APPLIED_KEY + '_' + getCurrentAccount();

export function getAppliedEmoji(): DocId[] {
  try {
    return (localStorage.getItem(appliedKey()) || '').split(',').filter(Boolean) as DocId[];
  } catch{
    return [];
  }
}

export function addAppliedEmoji(docId: DocId) {
  const list = [docId, ...getAppliedEmoji().filter((id) => id !== docId)].slice(0, APPLIED_MAX);
  try {
    localStorage.setItem(appliedKey(), list.join(','));
  } catch{}
}
