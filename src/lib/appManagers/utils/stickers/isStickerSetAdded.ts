import {StickerSet} from '@layer';

/**
 * An archived set keeps its `installed_date` — it counts as added only while it is out of the archive.
 */
export default function isStickerSetAdded(set: StickerSet.stickerSet) {
  return !!set.installed_date && !set.pFlags.archived;
}
