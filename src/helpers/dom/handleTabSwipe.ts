import {cancelContextMenuOpening} from '@helpers/dom/attachContextMenuListener';
import handleHorizontalSwipe, {SwipeHandlerHorizontalOptions} from '@helpers/dom/handleHorizontalSwipe';

export default function handleTabSwipe(options: SwipeHandlerHorizontalOptions) {
  return handleHorizontalSwipe({
    ...options,
    onSwipe: (xDiff, yDiff, e) => {
      xDiff *= -1;
      yDiff *= -1;

      if(Math.abs(xDiff) > 50) {
        options.onSwipe(xDiff, yDiff, e);
        cancelContextMenuOpening();

        return true;
      }
    }
  });
}
