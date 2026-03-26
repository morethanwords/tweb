import {Layout} from '@components/chat/bubbles/bubbleLayout';
import Name from '@components/chat/bubbles/bubbleName';
import Reply from '@components/chat/bubbles/bubbleReply';
import TopicName from '@components/chat/bubbles/bubbleTopicName';
import Attachment from '@components/chat/bubbles/bubbleAttachment';
import Text from '@components/chat/bubbles/bubbleText';
import Time from '@components/chat/bubbles/bubbleTime';
import Reactions from '@components/chat/bubbles/bubbleReactions';
import Tail from '@components/chat/bubbles/bubbleTail';
import ReplyMarkup from '@components/chat/bubbles/bubbleReplyMarkup';
import BesideButtons from '@components/chat/bubbles/bubbleBesideButtons';
import SpoilerOverlay from '@components/chat/bubbles/bubbleSpoilerOverlay';
import SendingStatus from '@components/chat/bubbles/bubbleSendingStatus';
import FactCheck from '@components/chat/bubbles/bubbleFactCheck';
import {BubbleContext, type BubbleContextValue} from '@components/chat/bubbles/context';

export type BubbleProps = {
  ctx: BubbleContextValue
};

export function Bubble(props: BubbleProps) {
  return (
    <BubbleContext.Provider value={props.ctx}>
      <Bubble.Layout>
        <Bubble.Name />
        <Bubble.TopicName />
        <Bubble.Reply />
        <Bubble.Attachment />
        <Bubble.Text />
        <Bubble.FactCheck />
        <Bubble.Time />
        <Bubble.Reactions />
        <Bubble.Tail />
        <Bubble.ReplyMarkup />
        <Bubble.BesideButtons />
        <Bubble.SpoilerOverlay />
        <Bubble.SendingStatus />
      </Bubble.Layout>
    </BubbleContext.Provider>
  );
}

Bubble.Layout = Layout;
Bubble.Name = Name;
Bubble.TopicName = TopicName;
Bubble.Reply = Reply;
Bubble.Attachment = Attachment;
Bubble.Text = Text;
Bubble.FactCheck = FactCheck;
Bubble.Time = Time;
Bubble.Reactions = Reactions;
Bubble.Tail = Tail;
Bubble.ReplyMarkup = ReplyMarkup;
Bubble.BesideButtons = BesideButtons;
Bubble.SpoilerOverlay = SpoilerOverlay;
Bubble.SendingStatus = SendingStatus;
