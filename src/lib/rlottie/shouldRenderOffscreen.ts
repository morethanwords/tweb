import IS_OFFSCREEN_CANVAS_SUPPORTED from '@environment/offscreenCanvasSupport';
import IS_IMAGE_BITMAP_SUPPORTED from '@environment/imageBitmapSupport';
import {IS_SAFARI} from '@environment/userAgent';
import Modes from '@config/modes';

const SHOULD_RENDER_OFFSCREEN = IS_OFFSCREEN_CANVAS_SUPPORTED &&
  IS_IMAGE_BITMAP_SUPPORTED &&
  !IS_SAFARI && // Safari default: keep sticker rendering on the main-thread paint (paired with the rlottie dedicated-worker fallback in apiManagerProxy)
  !Modes.noOffscreenCanvas &&
  (() => { try { return localStorage.getItem('noOffscreenCanvas') !== '1'; } catch(err) { return true; } })() &&
  import.meta.env.MODE !== 'test';

export default SHOULD_RENDER_OFFSCREEN;
