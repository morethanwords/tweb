/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MyMessage } from "../../lib/appManagers/appMessagesManager";
import wrapMessageActionTextNewUnsafe from "./messageActionTextNewUnsafe";

export default async function wrapMessageActionTextNew(message: MyMessage, plain: true): Promise<string>;
export default async function wrapMessageActionTextNew(message: MyMessage, plain?: false): Promise<HTMLElement>;
export default async function wrapMessageActionTextNew(message: MyMessage, plain: boolean): Promise<HTMLElement | string>;
export default async function wrapMessageActionTextNew(message: MyMessage, plain?: boolean): Promise<HTMLElement | string> {
  try {
    return await wrapMessageActionTextNewUnsafe(message, plain);
  } catch(err) {
    console.error('wrapMessageActionTextNewUnsafe error:', err);
    return plain ? '' : document.createElement('span');
  }
}
