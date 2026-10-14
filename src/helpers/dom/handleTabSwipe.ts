import {cancelContextMenuOpening} from '@helpers/dom/attachContextMenuListener';
import handleHorizontalSwipe, {SwipeHandlerHorizontalOptions} from '@helpers/dom/handleHorizontalSwipe';
import isDocumentRTL from '@helpers/dom/isDocumentRTL';

export default function handleTabSwipe(options: SwipeHandlerHorizontalOptions) {
  return handleHorizontalSwipe({
    ...options,
    onSwipe: (xDiff, yDiff, e) => {
      // * tabs run along the line: in RTL the next one comes with a swipe to the right, so a
      // * callback reads the distance along the line, whichever way that is
      xDiff *= isDocumentRTL() ? 1 : -1;
      yDiff *= -1;

      if(Math.abs(xDiff) > 50) {
        options.onSwipe(xDiff, yDiff, e);
        cancelContextMenuOpening();

        return true;
      }
    }
  });
}
