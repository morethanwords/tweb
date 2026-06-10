import IS_OFFSCREEN_CANVAS_SUPPORTED from '@environment/offscreenCanvasSupport';
import IS_IMAGE_BITMAP_SUPPORTED from '@environment/imageBitmapSupport';
import CAN_USE_TRANSFERABLES from '@environment/canUseTransferables';
import Modes from '@config/modes';

const SHOULD_RENDER_OFFSCREEN = IS_OFFSCREEN_CANVAS_SUPPORTED &&
  IS_IMAGE_BITMAP_SUPPORTED && CAN_USE_TRANSFERABLES &&
  !Modes.noOffscreenCanvas &&
  (() => { try { return localStorage.getItem('noOffscreenCanvas') !== '1'; } catch(err) { return true; } })() &&
  import.meta.env.MODE !== 'test';

export default SHOULD_RENDER_OFFSCREEN;
