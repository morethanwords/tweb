import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import getPeerTitleText, {GetPeerTitleOptions} from '@components/wrappers/getPeerTitleText';

export default async function getPeerTitle(options: GetPeerTitleOptions & {plainText: true}): Promise<string>;
export default async function getPeerTitle(options: GetPeerTitleOptions & {plainText?: false}): Promise<DocumentFragment>;
export default async function getPeerTitle(options: GetPeerTitleOptions): Promise<string | DocumentFragment>;

export default async function getPeerTitle(options: GetPeerTitleOptions): Promise<string | DocumentFragment> {
  const title = await getPeerTitleText(options);
  return options.plainText ? title : wrapEmojiText(title);
}
