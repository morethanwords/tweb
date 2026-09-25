/**
 * Pure (network-free) half of the chat archiver driven by the `tg-chat-archive`
 * skill: parses the peer a user names, turns raw MTProto messages into the
 * archive's self-contained records and renders those records as the monthly
 * transcripts an agent reads later. The network half is chatArchive.test.ts.
 */

import {mkdirSync, rmSync, writeFileSync} from 'fs';
import {join} from 'path';
import type {Chat, Message, MessageAction, MessageEntity, MessageMedia, Peer, TextWithEntities, User} from '@layer';

export type PeerSpec =
  | {kind: 'self'}
  | {kind: 'username', username: string}
  | {kind: 'user', id: string}
  | {kind: 'channel', id: string}
  // a bare negative id: a basic group (Bot API style) or a channel (tweb URL style)
  | {kind: 'chatOrChannel', id: string};

export type PeerRef = {key: string, name: string, username?: string};

/**
 * "This one is dealt with" — set by the agent (mark.sh), never by a sync, so a later session
 * does not check again whether what the message asked for was done.
 */
export type DoneMark = {
  // when it was marked, ISO
  at: string,
  // what was done about it, or where — short
  note?: string,
  // the message's editTs when it was marked: an edit since then leaves the mark stale
  editTs?: number
};

export type ArchivedMessage = {
  id: number,
  ts: number,
  date: string,
  from?: PeerRef,
  out?: true,
  text?: string,
  media?: string,
  service?: string,
  replyTo?: number,
  replyToPeer?: string,
  quote?: string,
  topicId?: number,
  // set on the service messages that create or rename a forum topic
  topicTitle?: string,
  fwdFrom?: string,
  viaBot?: string,
  editDate?: string,
  // the raw edit_date, hidden edits too: a sync compares it to tell an edit from a re-read
  editTs?: number,
  groupedId?: string,
  postAuthor?: string,
  views?: number,
  reactions?: Record<string, number>,
  pinned?: true,
  deleted?: true,
  done?: DoneMark
};

export type ArchiveContext = {
  // peer key → display info, filled from the users/chats of every response
  peers: Map<string, PeerRef>,
  // the chat being archived: sender of channel posts and of incoming private messages
  chat: PeerRef,
  self: PeerRef
};

export function parsePeerSpec(input: string): PeerSpec {
  let s = input.trim();
  if(/^(me|self|saved)$/i.test(s)) return {kind: 'self'};

  // https://t.me/c/<channelId>/<msgId> — private channel post links
  const privateLink = s.match(/t\.me\/c\/(\d+)/i);
  if(privateLink) return {kind: 'channel', id: privateLink[1]};

  // web.telegram.org/k/#-123 / #@name, t.me/name
  s = s.replace(/^https?:\/\//i, '').replace(/^web\.telegram\.org\/[a-z]\/#?/i, '').replace(/^#/, '');
  const tme = s.match(/^(?:t\.me|telegram\.me)\/([A-Za-z0-9_]+)/i);
  if(tme) return {kind: 'username', username: tme[1]};
  if(s.startsWith('@')) return {kind: 'username', username: s.slice(1)};

  if(/^-100\d{10,}$/.test(s)) return {kind: 'channel', id: s.slice(4)};
  if(/^-\d+$/.test(s)) return {kind: 'chatOrChannel', id: s.slice(1)};
  if(/^\d+$/.test(s)) return {kind: 'user', id: s};
  if(/^[A-Za-z][A-Za-z0-9_]{3,}$/.test(s)) return {kind: 'username', username: s};

  throw new Error(`cannot parse peer "${input}" — expected an id, @username or t.me link`);
}

export function peerKey(peer: Peer): string {
  switch(peer._) {
    case 'peerUser': return 'user' + peer.user_id;
    case 'peerChat': return 'chat' + peer.chat_id;
    case 'peerChannel': return 'channel' + peer.channel_id;
  }
}

export function userName(user: User.user) {
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Deleted Account';
}

/** Remember the display names every response carries. */
export function savePeers(ctx: ArchiveContext, users: User[] = [], chats: Chat[] = []) {
  for(const user of users) {
    if(user._ !== 'user') continue;
    ctx.peers.set('user' + user.id, {key: 'user' + user.id, name: userName(user), username: user.username});
  }

  for(const chat of chats) {
    if(chat._ === 'chatEmpty') continue;
    const key = (chat._ === 'channel' || chat._ === 'channelForbidden' ? 'channel' : 'chat') + chat.id;
    const username = chat._ === 'channel' ? chat.username : undefined;
    ctx.peers.set(key, {key, name: chat.title, username});
  }
}

function lookup(ctx: ArchiveContext, peer: Peer): PeerRef {
  const key = peerKey(peer);
  return ctx.peers.get(key) || {key, name: key};
}

/** Entity offsets are UTF-16 code units, which is what JS strings index by. */
export function renderText(text: string, entities: MessageEntity[] = []) {
  const links = entities
  .filter((entity): entity is MessageEntity.messageEntityTextUrl => entity._ === 'messageEntityTextUrl')
  .sort((a, b) => b.offset - a.offset);

  for(const {offset, length, url} of links) {
    const label = text.slice(offset, offset + length);
    if(label === url) continue;
    text = text.slice(0, offset) + `[${label}](${url})` + text.slice(offset + length);
  }

  return text;
}

const plain = (text: TextWithEntities) => text?.text ?? '';

function formatDuration(seconds: number) {
  seconds = Math.round(seconds || 0);
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSize(bytes: number) {
  if(!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while(bytes >= 1024 && i < units.length - 1) bytes /= 1024, ++i;
  return `${bytes.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function describeDocument(media: MessageMedia.messageMediaDocument) {
  const doc = media.document;
  if(!doc || doc._ !== 'document') return '[file]';

  let fileName: string, audio: any, video: any, sticker: string, isGif = false;
  for(const attr of doc.attributes) {
    switch(attr._) {
      case 'documentAttributeFilename': fileName = attr.file_name; break;
      case 'documentAttributeAudio': audio = attr; break;
      case 'documentAttributeVideo': video = attr; break;
      case 'documentAttributeSticker': sticker = attr.alt; break;
      case 'documentAttributeAnimated': isGif = true; break;
    }
  }

  if(sticker !== undefined) return sticker ? `[sticker ${sticker}]` : '[sticker]';
  if(audio?.pFlags?.voice) return `[voice ${formatDuration(audio.duration)}]`;
  if(video?.pFlags?.round_message) return `[video message ${formatDuration(video.duration)}]`;
  if(isGif) return '[GIF]';
  if(video) return `[video ${formatDuration(video.duration)}]`;
  if(audio) {
    const title = [audio.performer, audio.title].filter(Boolean).join(' – ') || fileName;
    return `[audio${title ? ' ' + title : ''} ${formatDuration(audio.duration)}]`;
  }

  return `[file${fileName ? ' ' + fileName : ''}${doc.size ? ', ' + formatSize(+doc.size) : ''}]`;
}

export function describeMedia(media: MessageMedia): string {
  switch(media._) {
    case 'messageMediaEmpty':
    case 'messageMediaUnsupported':
      return undefined;
    case 'messageMediaPhoto': return '[photo]';
    case 'messageMediaDocument': return describeDocument(media);
    case 'messageMediaWebPage': {
      const page = media.webpage;
      return page._ === 'webPage' ? `[link preview: ${[page.site_name, page.title].filter(Boolean).join(' — ') || page.url}]` : undefined;
    }
    case 'messageMediaPoll': {
      const votes = new Map<string, number>();
      for(const result of media.results?.results || []) {
        votes.set(Buffer.from(result.option).toString('hex'), result.voters);
      }

      const answers = media.poll.answers.map((answer) => {
        if(answer._ !== 'pollAnswer') return '';
        const count = votes.get(Buffer.from(answer.option).toString('hex'));
        return plain(answer.text) + (count !== undefined ? ` (${count})` : '');
      });
      return `[${media.poll.pFlags.quiz ? 'quiz' : 'poll'}: ${plain(media.poll.question)} — ${answers.join(' / ')}]`;
    }
    case 'messageMediaToDo':
      return `[checklist: ${plain(media.todo.title)} — ${media.todo.list.map((item) => plain(item.title)).join(' / ')}]`;
    case 'messageMediaGeo':
    case 'messageMediaGeoLive': {
      const geo = media.geo;
      return geo._ === 'geoPoint' ? `[location ${geo.lat.toFixed(5)}, ${geo.long.toFixed(5)}]` : '[location]';
    }
    case 'messageMediaVenue': return `[venue: ${media.title}, ${media.address}]`;
    case 'messageMediaContact':
      return `[contact: ${[media.first_name, media.last_name].filter(Boolean).join(' ')} ${media.phone_number}]`;
    case 'messageMediaDice': return `[dice ${media.emoticon} = ${media.value}]`;
    case 'messageMediaGame': return `[game: ${media.game.title}]`;
    case 'messageMediaInvoice': return `[invoice: ${media.title}]`;
    case 'messageMediaStory': return '[story]';
    case 'messageMediaPaidMedia': return `[paid media, ${media.stars_amount} stars]`;
    default: return `[${humanize(media._.replace(/^messageMedia/, ''))}]`;
  }
}

/** messageActionChatJoinedByLink → "chat joined by link" */
function humanize(name: string) {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

export function describeAction(action: MessageAction, ctx: ArchiveContext, message: Message.messageService): string {
  const user = (id: string | number) => lookup(ctx, {_: 'peerUser', user_id: id as UserId}).name;
  switch(action._) {
    case 'messageActionChatCreate': return `created the group «${action.title}»`;
    case 'messageActionChannelCreate': return `created the channel «${action.title}»`;
    case 'messageActionChatEditTitle': return `changed the title to «${action.title}»`;
    case 'messageActionChatEditPhoto': return 'changed the photo';
    case 'messageActionChatDeletePhoto': return 'removed the photo';
    case 'messageActionChatAddUser': {
      const fromId = message.from_id?._ === 'peerUser' ? String(message.from_id.user_id) : undefined;
      const users = action.users.map(String);
      return users.length === 1 && users[0] === fromId ? 'joined the group' : `added ${users.map(user).join(', ')}`;
    }
    case 'messageActionChatDeleteUser': {
      const fromId = message.from_id?._ === 'peerUser' ? String(message.from_id.user_id) : undefined;
      return String(action.user_id) === fromId ? 'left the group' : `removed ${user(action.user_id)}`;
    }
    case 'messageActionChatJoinedByLink': return 'joined via invite link';
    case 'messageActionChatJoinedByRequest': return 'was accepted into the group';
    case 'messageActionPinMessage': return `pinned #${message.reply_to?._ === 'messageReplyHeader' ? message.reply_to.reply_to_msg_id : '?'}`;
    case 'messageActionHistoryClear': return 'cleared the history';
    case 'messageActionChatMigrateTo': return `upgraded the group to a supergroup (channel${action.channel_id})`;
    case 'messageActionChannelMigrateFrom': return `supergroup created from the group «${action.title}»`;
    case 'messageActionTopicCreate': return `created the topic «${action.title}»`;
    case 'messageActionTopicEdit': {
      const changes = [
        action.title !== undefined && `renamed the topic to «${action.title}»`,
        action.closed !== undefined && (action.closed ? 'closed the topic' : 'reopened the topic'),
        action.hidden !== undefined && (action.hidden ? 'hid the topic' : 'unhid the topic')
      ].filter(Boolean);
      return changes.join(', ') || 'edited the topic';
    }
    case 'messageActionPhoneCall':
      return `${action.pFlags.video ? 'video ' : ''}call${action.duration ? ' ' + formatDuration(action.duration) : ''}${action.reason?._ === 'phoneCallDiscardReasonMissed' ? ' (missed)' : ''}`;
    case 'messageActionGroupCall':
      return action.duration ? `video chat ended (${formatDuration(action.duration)})` : 'started a video chat';
    case 'messageActionScreenshotTaken': return 'took a screenshot';
    case 'messageActionCustomAction': return action.message;
    case 'messageActionContactSignUp': return 'joined Telegram';
    case 'messageActionSetMessagesTTL': return action.period ? `set auto-delete to ${action.period}s` : 'disabled auto-delete';
    default: return humanize(action._.replace(/^messageAction/, ''));
  }
}

function describeReactions(message: Message.message) {
  const results = message.reactions?.results;
  if(!results?.length) return undefined;

  const reactions: Record<string, number> = {};
  for(const {reaction, count} of results) {
    const key = reaction._ === 'reactionEmoji' ? reaction.emoticon : (reaction._ === 'reactionPaid' ? '⭐' : 'custom');
    reactions[key] = (reactions[key] || 0) + count;
  }

  return reactions;
}

function sender(message: Message.message | Message.messageService, ctx: ArchiveContext): PeerRef {
  if(message.from_id) return lookup(ctx, message.from_id);
  // no from_id: a channel post, or an incoming message in a private chat
  return message.pFlags.out ? ctx.self : ctx.chat;
}

export function archiveMessage(message: Message, ctx: ArchiveContext): ArchivedMessage {
  if(message._ === 'messageEmpty') return undefined;

  const out: ArchivedMessage = {
    id: message.id,
    ts: message.date,
    date: new Date(message.date * 1000).toISOString(),
    from: sender(message, ctx)
  };

  if(message.pFlags.out) out.out = true;

  const replyTo = message.reply_to;
  if(replyTo?._ === 'messageReplyHeader') {
    if(replyTo.reply_to_msg_id) out.replyTo = replyTo.reply_to_msg_id;
    if(replyTo.reply_to_peer_id) out.replyToPeer = peerKey(replyTo.reply_to_peer_id);
    if(replyTo.quote_text) out.quote = replyTo.quote_text;
    const topicId = replyTo.reply_to_top_id ?? (replyTo.pFlags.forum_topic ? replyTo.reply_to_msg_id : undefined);
    if(topicId) out.topicId = topicId;
  }

  if(message._ === 'messageService') {
    const action = message.action;
    out.service = describeAction(action, ctx, message);
    if(action._ === 'messageActionTopicCreate' || (action._ === 'messageActionTopicEdit' && action.title !== undefined)) {
      out.topicTitle = action.title;
    }

    return out;
  }

  if(message.message) out.text = renderText(message.message, message.entities);
  if(message.media) {
    const media = describeMedia(message.media);
    if(media) out.media = media;
  }

  const fwd = message.fwd_from;
  if(fwd) {
    out.fwdFrom = fwd.from_name ?? (fwd.from_id ? lookup(ctx, fwd.from_id).name : 'hidden user');
    if(fwd.post_author) out.fwdFrom += ` (${fwd.post_author})`;
  }

  if(message.via_bot_id) {
    const bot = ctx.peers.get('user' + message.via_bot_id);
    out.viaBot = bot?.username ? '@' + bot.username : (bot?.name ?? 'user' + message.via_bot_id);
  }

  if(message.edit_date) {
    out.editTs = message.edit_date;
    if(!message.pFlags.edit_hide) out.editDate = new Date(message.edit_date * 1000).toISOString();
  }
  if(message.grouped_id) out.groupedId = String(message.grouped_id);
  if(message.post_author) out.postAuthor = message.post_author;
  if(message.views) out.views = message.views;
  if(message.pFlags.pinned) out.pinned = true;

  const reactions = describeReactions(message);
  if(reactions) out.reactions = reactions;

  return out;
}

/**
 * A message read again (the sync re-reads the newest ones every run). The stored record stands
 * unless the message was edited since — the edit timestamp decides — so what was archived, and
 * any done mark on it, is not overwritten by a plain re-read; only the counters that move without
 * an edit (views, reactions, pinned) and the raw edit timestamp are taken from the fresh copy. An edited message takes the
 * fresh content and keeps its mark, which then reads as stale.
 */
export function mergeArchivedMessage(stored: ArchivedMessage, fresh: ArchivedMessage): ArchivedMessage {
  if(!stored) return fresh;

  const merged: ArchivedMessage = editTsOf(stored) === editTsOf(fresh) ?
    // editTs too: a record archived before it existed learns its exact value
    {...stored, views: fresh.views, reactions: fresh.reactions, pinned: fresh.pinned, editTs: fresh.editTs} :
    {...fresh, done: stored.done};

  // read again, so not gone from the server
  delete merged.deleted;
  for(const key of ['views', 'reactions', 'pinned', 'editTs', 'done'] as const) {
    if(merged[key] === undefined) delete merged[key];
  }

  return merged;
}

/**
 * When the message was last edited, 0 if never. Records archived before `editTs` existed carry
 * only the visible `editDate`, so that one stands in for them.
 */
export function editTsOf(message: ArchivedMessage) {
  return message.editTs ?? (message.editDate ? Date.parse(message.editDate) / 1000 : 0);
}

/** A done mark made before the message's latest edit: what it asks for may have changed. */
export function isDoneStale(message: ArchivedMessage) {
  return !!message.done && (message.done.editTs ?? 0) !== editTsOf(message);
}

export function markDone(message: ArchivedMessage, note?: string, at = new Date().toISOString()): ArchivedMessage {
  const done: DoneMark = {at};
  if(note) done.note = note;
  const editTs = editTsOf(message);
  if(editTs) done.editTs = editTs;
  return {...message, done};
}

/**
 * Forum topic titles. A topic's id is the id of the service message that
 * created it; a rename carries the topic it belongs to. Expects ascending ids.
 */
export function collectTopics(messages: ArchivedMessage[], topics: Record<number, string> = {}) {
  for(const message of messages) {
    if(message.topicTitle !== undefined) topics[message.topicId ?? message.id] = message.topicTitle;
  }

  return topics;
}

export type TranscriptOptions = {
  title: string,
  timeZone?: string,
  // forum topic id → title; when set, every line names its topic
  topics?: Record<number, string>
};

function localParts(ts: number, timeZone: string) {
  const parts: Record<string, string> = {};
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
    hourCycle: 'h23'
  });
  for(const part of format.formatToParts(new Date(ts * 1000))) parts[part.type] = part.value;
  return {
    month: `${parts.year}-${parts.month}`,
    day: `${parts.year}-${parts.month}-${parts.day}, ${parts.weekday}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

export function renderLine(message: ArchivedMessage, time: string, topics?: Record<number, string>) {
  const head = [`#${message.id}`, time];
  if(topics) head.push(`[${topics[message.topicId ?? 1] ?? 'topic ' + (message.topicId ?? 1)}]`);
  if(message.deleted) head.push('✗deleted');
  // ✔ dealt with; ✔? marked before its latest edit — check it again. The note goes on the
  // header line, where a grep for the message lands
  if(message.done) {
    const note = message.done.note ? `(${message.done.note.replace(/\n/g, ' ')})` : '';
    head.push((isDoneStale(message) ? '✔?' : '✔') + note);
  }

  if(message.service) {
    return `${head.join(' ')} · ${message.from.name} ${message.service}`;
  }

  let who = message.from.name;
  if(message.postAuthor && message.postAuthor !== who) who += ` (${message.postAuthor})`;
  if(message.viaBot) who += ` via ${message.viaBot}`;
  if(message.replyTo && message.replyTo !== message.topicId) who += ` ↩${message.replyToPeer ? message.replyToPeer + '/' : ''}${message.replyTo}`;
  if(message.fwdFrom) who += ` ↪ ${message.fwdFrom}`;
  if(message.editDate) who += ' ✎';

  // a link preview repeats a URL the text already carries
  const media = message.media?.startsWith('[link preview') && message.text ? undefined : message.media;
  const body = [
    message.quote && `«${message.quote.replace(/\n/g, ' ')}»`,
    media,
    message.text
  ].filter(Boolean).join(' ').replace(/\n(?=.)/g, '\n    ');

  const reactions = message.reactions ?
    '  {' + Object.entries(message.reactions).map(([emoji, count]) => emoji + count).join(' ') + '}' :
    '';

  return `${head.join(' ')} ${who}: ${body}${reactions}`;
}

/** month ('2026-09') → markdown transcript of that month */
export function renderTranscripts(messages: ArchivedMessage[], options: TranscriptOptions) {
  const timeZone = options.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const months = new Map<string, string[]>();
  let lastDay: string;

  for(const message of messages) {
    const {month, day, time} = localParts(message.ts, timeZone);
    let lines = months.get(month);
    if(!lines) {
      months.set(month, lines = [
        `# ${options.title} — ${month}`,
        '',
        `Times are ${timeZone}. Generated from messages.jsonl — edit that, not this.`
      ]);
      lastDay = undefined;
    }

    if(day !== lastDay) {
      lines.push('', `## ${day}`, '');
      lastDay = day;
    }

    lines.push(renderLine(message, time, options.topics));
  }

  const out = new Map<string, string>();
  months.forEach((lines, month) => out.set(month, lines.join('\n') + '\n'));
  return out;
}

/** Regenerates <chatDir>/transcript/ from the records — a sync and a mark both end with it. */
export function writeTranscripts(chatDir: string, messages: ArchivedMessage[], options: TranscriptOptions) {
  const transcriptDir = join(chatDir, 'transcript');
  rmSync(transcriptDir, {recursive: true, force: true});
  mkdirSync(transcriptDir);
  renderTranscripts(messages, options).forEach((text, month) => {
    writeFileSync(join(transcriptDir, month + '.md'), text);
  });
}
