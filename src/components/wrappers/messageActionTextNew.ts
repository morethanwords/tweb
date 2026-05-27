import type {MyMessage} from '@appManagers/appMessagesManager';
import wrapMessageActionTextNewUnsafe from '@components/wrappers/messageActionTextNewUnsafe';

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
