import StickerType from '@config/stickerType';
import type {ResizableLayer} from '@components/mediaEditor/types';

/** Internal rollout barrier. No URL/localStorage override: legacy sessions must
 * remain untouched until the controller, composition and lifecycle pass together.
 * Static-source qualification and reset/fine-angle controllers have focused unit
 * coverage. Fresh browser PNG, lifecycle, RTL and keyboard evidence is still
 * required from the sole executor; units are not rollout approval.
 * Fixtures may explicitly opt into the candidate path, never bypass qualification.
 */
export const desktopCropIntegrationReady = false;

// Unlike the legacy GIF helper, reject WebM on Firefox too: this is a static
// output contract, not a decision to omit unsupported animation from a GIF.
export function hasUnsupportedDesktopCropLayers(layers: readonly ResizableLayer[]) {
  return layers.some(layer => layer.type === 'sticker' && layer.sticker?.sticker !== StickerType.Static);
}
