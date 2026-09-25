import type ChatInput from '@components/chat/input';
import {ChatType} from '@components/chat/chatType';
import type {AiEditorContext} from '@components/richMessageInput/aiContext';

/** Chat policy stays here; the field only receives actions for one captured context. */
export default function createAiEditorContext(instance: ChatInput): AiEditorContext {
  return {
    capture: () => {
      const middleware = instance.getMiddleware();
      const {peerId, threadId, type: chatType} = instance.chat;
      const editMsgId = instance.editMsgId;
      const wasEphemeral = instance.isEphemeralComposerMode();
      const isCurrent = () => middleware() && instance.chat.peerId === peerId &&
        instance.chat.threadId === threadId && instance.chat.type === chatType &&
        instance.editMsgId === editMsgId && instance.isEphemeralComposerMode() === wasEphemeral;
      const canSend = !wasEphemeral && !instance.chat.starsAmount && !editMsgId;
      const sendingParams = canSend ? instance.chat.getMessageSendingParams() : undefined;
      return {
        peerId,
        isCurrent,
        isScheduled: chatType === ChatType.Scheduled,
        canSendWhenOnline: instance.canSendWhenOnline,
        clear: () => instance.setInputValue(''),
        send: canSend ? async(text, options, richMessage) => {
          if(!isCurrent()) return false;
          const result = await instance.Class.sendMessageWithForward({
            text,
            sendTextParams: {richMessage, noWebPage: true},
            slowModeParams: instance.getDefaultParamsForSlowModeTooltip(),
            chatType,
            paidMessageInterceptor: instance.paidMessageInterceptor,
            sendingParams: {
              ...sendingParams,
              silent: options?.silent,
              scheduleDate: options?.scheduleDate,
              scheduleRepeatPeriod: options?.scheduleRepeatPeriod,
              effect: options?.effect
            }
          });
          return !!result && !!result.messageCount;
        } : undefined
      };
    }
  };
}
