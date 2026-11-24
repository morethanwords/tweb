import {IS_APPLE} from '@environment/userAgent';

/** The app's own modifier is held: Cmd on a Mac, Ctrl elsewhere */
export default function isModKeyPressed(e: KeyboardEvent | MouseEvent) {
  return IS_APPLE ? e.metaKey : e.ctrlKey;
}
