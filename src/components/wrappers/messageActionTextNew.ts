import { MyMessage } from "../../lib/appManagers/appMessagesManager";
import wrapMessageActionTextNewUnsafe from "./messageActionTextNewUnsafe";

export default function wrapMessageActionTextNew(message: MyMessage, plain: true): string;
export default function wrapMessageActionTextNew(message: MyMessage, plain?: false): HTMLElement;
export default function wrapMessageActionTextNew(message: MyMessage, plain: boolean): HTMLElement | string;
export default function wrapMessageActionTextNew(message: MyMessage, plain?: boolean): HTMLElement | string {
  try {
    return wrapMessageActionTextNewUnsafe(message, plain);
  } catch(err) {
    console.error('wrapMessageActionTextNewUnsafe error:', err);
    return plain ? '' : document.createElement('span');
  }
}
