
type CanVideoBeAnimatedArgs = {
  noSound: boolean;
  size: number;
  isEditingMediaFromAlbum?: boolean;
};

/**
 * Determines whether a video can be labeled as GIF, will loop in the chat if so
 */
export default function canVideoBeAnimated({noSound, size, isEditingMediaFromAlbum}: CanVideoBeAnimatedArgs) {
  return !isEditingMediaFromAlbum && noSound &&
    size > (10 * 1024) &&
    size < (10 * 1024 * 1024);
}
