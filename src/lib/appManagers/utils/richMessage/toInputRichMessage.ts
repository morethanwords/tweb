import type {InputRichMessage, RichMessage} from '@layer';
import {inputPageBlock} from '@lib/richTextProcessor/inputRichMessageBlocks';
import inferRichMessageNoAutolink from '@lib/richTextProcessor/inferRichMessageNoAutolink';

export default function toInputRichMessage(
  richMessage: RichMessage.richMessage
): InputRichMessage.inputRichMessage {
  return {
    _: 'inputRichMessage',
    pFlags: {
      rtl: richMessage.pFlags.rtl,
      noautolink: inferRichMessageNoAutolink(richMessage) || undefined
    },
    blocks: richMessage.blocks.map(inputPageBlock)
  };
}
