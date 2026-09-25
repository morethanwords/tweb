import type {MyDraftMessage} from '@appManagers/appDraftsManager';
import type {MyDocument} from '@appManagers/appDocsManager';
import type {MyMessage} from '@appManagers/appMessagesManager';
import type {MessageMedia, PageBlock, RichMessage} from '@layer';

/**
 * Exact 18px preview glyphs that exist in tdesktop but are not in tweb's icon
 * font yet. Keep the substitutions in one place so the real icons can replace
 * them without touching message classification or rendering.
 */
export const MESSAGE_PREVIEW_ICON_FALLBACKS = {
  contact: 'person_filled',
  giveaway: 'gift',
  invoice: 'card',
  richMath: 'monospace',
  richPullquote: 'quote',
  richTable: 'list'
} satisfies Record<string, Icon>;

export function getTodoItemReplyPreview(
  media: MessageMedia.messageMediaToDo,
  todoItemId?: number
) {
  const item = media.todo.list.find((item) => item.id === todoItemId);
  if(!item) {
    return;
  }

  const completed = media.completions?.some((completion) => completion.id === item.id);
  return {
    icon: completed ? 'checkboxon' as const : 'checkboxempty' as const,
    text: item.title
  };
}

function getRichBlockPreviewIcon(block: PageBlock): Icon | undefined {
  switch(block._) {
    case 'pageBlockList': {
      return block.items.some((item) => item.pFlags.checkbox) ? 'checklist_done' : undefined;
    }
    case 'pageBlockOrderedList': {
      return block.items.some((item) => item.pFlags.checkbox) ? 'checklist_done' : undefined;
    }
    case 'pageBlockBlockquote':
    case 'pageBlockBlockquoteBlocks':
      return 'quote';
    case 'pageBlockPullquote':
      return MESSAGE_PREVIEW_ICON_FALLBACKS.richPullquote;
    case 'pageBlockPhoto':
    case 'pageBlockVideo':
    case 'pageBlockCollage':
    case 'pageBlockSlideshow':
      return 'attach';
    case 'pageBlockAudio':
      return 'music_filled';
    case 'pageBlockMap':
      return 'location';
    case 'pageBlockMath':
      return MESSAGE_PREVIEW_ICON_FALLBACKS.richMath;
    case 'pageBlockTable':
      return MESSAGE_PREVIEW_ICON_FALLBACKS.richTable;
    case 'pageBlockCover':
      return getRichBlockPreviewIcon(block.cover);
  }
}

function getRichMessagePreviewIcon(richMessage?: RichMessage): Icon | undefined {
  for(const block of richMessage?.blocks || []) {
    const icon = getRichBlockPreviewIcon(block);
    if(icon) {
      return icon;
    }
  }
}

function getServiceMessagePreviewIcon(message: Extract<MyMessage, {_: 'messageService'}>): Icon | undefined {
  switch(message.action._) {
    case 'messageActionPhoneCall':
    case 'messageActionConferenceCall':
      return 'phone';
    case 'messageActionGiftPremium':
    case 'messageActionGiftCode':
    case 'messageActionGiftStars':
    case 'messageActionGiftTon':
    case 'messageActionStarGift':
    case 'messageActionStarGiftUnique':
    case 'messageActionGiveawayLaunch':
    case 'messageActionGiveawayResults':
      return MESSAGE_PREVIEW_ICON_FALLBACKS.giveaway;
  }
}

export default function getMessagePreviewIcon(
  message: MyMessage | MyDraftMessage
): Icon | undefined {
  if(message._ === 'messageService') {
    return getServiceMessagePreviewIcon(message);
  }

  if(message._ === 'draftMessage') {
    return;
  }

  const media = message.media;
  switch(media?._) {
    case 'messageMediaGeo':
    case 'messageMediaGeoLive':
    case 'messageMediaVenue':
      return 'location';
    case 'messageMediaContact':
      return MESSAGE_PREVIEW_ICON_FALLBACKS.contact;
    case 'messageMediaDocument': {
      const document = media.document as MyDocument;
      if(document?.type === 'audio') {
        return 'music_filled';
      }
      if(!['video', 'voice', 'round', 'gif', 'sticker'].includes(document?.type)) {
        return 'document';
      }
      break;
    }
    case 'messageMediaInvoice':
      return MESSAGE_PREVIEW_ICON_FALLBACKS.invoice;
    case 'messageMediaPoll':
      return 'poll';
    case 'messageMediaStory':
      return 'story';
    case 'messageMediaGiveaway':
    case 'messageMediaGiveawayResults':
      return MESSAGE_PREVIEW_ICON_FALLBACKS.giveaway;
    case 'messageMediaToDo':
      return 'checklist_done';
    case 'messageMediaCall':
      return 'phone';
  }

  return getRichMessagePreviewIcon(message.rich_message);
}
