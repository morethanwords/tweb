/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyMessage} from '../../lib/appManagers/appMessagesManager';
import wrapMessageActionTextNewUnsafe from './messageActionTextNewUnsafe';

export type WrapMessageActionTextOptions = {
  message: MyMessage,
  plain?: boolean,
  noLinks?: boolean,
  noTextFormat?: boolean
} & WrapSomethingOptions;

export default async function wrapMessageActionTextNew(options: WrapMessageActionTextOptions & {plain: true}): Promise<string>;
export default async function wrapMessageActionTextNew(options: WrapMessageActionTextOptions & {plain?: false}): Promise<HTMLElement>;
export default async function wrapMessageActionTextNew(options: WrapMessageActionTextOptions): Promise<string | HTMLElement>;

export default async function wrapMessageActionTextNew(options: WrapMessageActionTextOptions): Promise<string | HTMLElement> {
  try {
    return await wrapMessageActionTextNewUnsafe(options);
  } catch(err) {
    console.error('wrapMessageActionTextNewUnsafe error:', err);
    return options.plain ? '' : document.createElement('span');
  }
}
