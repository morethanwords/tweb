import pen from '@/assets/mediaEditor/desktop/pen.json?url';
import marker from '@/assets/mediaEditor/desktop/marker.json?url';
import arrow from '@/assets/mediaEditor/desktop/arrow.json?url';
import eraser from '@/assets/mediaEditor/desktop/eraser.json?url';
import blur from '@/assets/mediaEditor/desktop/blur.json?url';
import neon from '@/assets/mediaEditor/android/photo_neon.json?url';
import alignment from '@/assets/mediaEditor/android/photo_text_allign.json?url';

// Both clients ship identical brush artwork. One source URL also keeps bundled
// dev serving from generating aliases for byte-identical, differently named files.
export const nativeBrushAssets: Record<string, string> = {
  photo_pen: pen,
  photo_marker: marker,
  photo_arrow: arrow,
  photo_eraser: eraser,
  photo_blur: blur,
  photo_neon: neon,
  photo_text_allign: alignment
};
