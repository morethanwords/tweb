const IconsReverse = new Set<Icon>([
  'avatarnext',
  'avatarprevious',
  'arrow_next',
  'arrow_prev',
  'back',
  'bubblereply',
  'channel',
  'chatspinned',
  'forward',
  'forward_filled',
  'group',
  'group_filled',
  'left',
  'listscreenshare_filled',
  'logout',
  'mute',
  'muted',
  'unmute',
  'newchannel_filled',
  'newchannel',
  'newgroup',
  'newgroup_filled',
  'next',
  'nosound_filled',
  'previous',
  'send_filled',
  'send2',
  'reply',
  'reply_filled',
  'reply_crossed',
  'sharescreen_filled',
  'transcribe',
  'storyreply',
  'premium_noads_filled',
  'topics',
  'topics_filled',
  'pinlist',
  'deleteleft',
  'list_bulleted',
  'list_checked',
  'undo',
  'redo',
  'rightpanel'
]);

/** The class that mirrors `icon` in a right-to-left layout, if it points along the line. */
export function getIconMirrorClass(icon: Icon) {
  return IconsReverse.has(icon) ? 'icon-mirror' : undefined;
}

export default IconsReverse;
