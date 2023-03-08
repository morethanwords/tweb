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

export default async function wrapMessageActionTextNew<T extends WrapMessageActionTextOptions>(
  options: T
): Promise<T['plain'] extends true ? string : HTMLElement> {
  try {
    return await wrapMessageActionTextNewUnsafe(options) as any;
  } catch(err) {
    console.error('wrapMessageActionTextNewUnsafe error:', err);
    return options.plain ? '' : document.createElement('span') as any;
  }
}
