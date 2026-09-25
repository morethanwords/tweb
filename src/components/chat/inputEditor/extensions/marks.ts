import {Mark, mergeAttributes} from '@tiptap/core';
import classNames from '@helpers/string/classNames';
import {isAllowedLinkHref} from '@helpers/string/normalizeLinkUrl';

const DATE_FLAGS = [
  'relative',
  'short_time',
  'long_time',
  'short_date',
  'long_date',
  'day_of_week'
];

export const ChatInlineCode = Mark.create({
  name: 'code',
  excludes: 'bold italic underline strike subscript superscript highlight spoiler link mentionName formattedDate code',
  code: true,
  exitable: true,

  parseHTML() {
    return [
      {tag: 'code'},
      {tag: '[data-markup*="monospace"]'}
    ];
  },

  renderHTML({HTMLAttributes}) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'class': 'is-markup',
      'data-markup': 'markup-monospace',
      'style': 'font-family: markup-monospace'
    }), 0];
  }
});

export const ChatSpoiler = Mark.create({
  name: 'spoiler',
  inclusive: false,

  parseHTML() {
    return [
      {tag: '[data-markup*="spoiler"]'},
      {tag: '[data-spoiler]'},
      {tag: 'tg-spoiler'},
      {tag: '.tg-spoiler'},
      {tag: '.spoiler-text'}
    ];
  },

  renderHTML({HTMLAttributes}) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'class': 'is-markup',
      'data-markup': 'markup-spoiler',
      'data-spoiler': '',
      'style': 'font-family: markup-spoiler'
    }), 0];
  }
});

export const ChatHighlight = Mark.create({
  name: 'highlight',
  excludes: 'code formattedDate',

  parseHTML() {
    return [{tag: 'mark'}, {tag: '[data-highlight]'}];
  },

  renderHTML({HTMLAttributes}) {
    return ['mark', mergeAttributes(HTMLAttributes, {
      'class': classNames('text-highlight', 'chat-input-highlight'),
      'data-highlight': ''
    }), 0];
  }
});

export const ChatFormattedDate = Mark.create({
  name: 'formattedDate',
  excludes: 'bold italic underline strike subscript superscript highlight spoiler link mentionName code formattedDate',
  inclusive: false,

  addAttributes() {
    return {
      date: {default: 0, rendered: false},
      pFlags: {default: {}, rendered: false}
    };
  },

  parseHTML() {
    return [{
      tag: '[data-date]',
      getAttrs: (element) => {
        const flags = new Set((element.getAttribute('data-date-flags') || '').split(','));
        const pFlags = Object.fromEntries(DATE_FLAGS.filter((flag) => flags.has(flag)).map((flag) => [flag, true]));
        return {
          date: Number(element.getAttribute('data-date')) || 0,
          pFlags
        };
      }
    }, {
      tag: 'time[datetime]',
      getAttrs: (element) => {
        const milliseconds = Date.parse(element.getAttribute('datetime') || '');
        return Number.isFinite(milliseconds) ? {
          date: Math.floor(milliseconds / 1000),
          pFlags: {}
        } : false;
      }
    }];
  },

  renderHTML({mark, HTMLAttributes}) {
    const flags = DATE_FLAGS.filter((flag) => mark.attrs.pFlags?.[flag]);
    return ['span', mergeAttributes(HTMLAttributes, {
      'class': 'formatted-date is-markup',
      'data-date': `${mark.attrs.date}`,
      'data-date-flags': flags.join(','),
      'data-markup': 'markup-date',
      'style': 'font-family: markup-date'
    }), 0];
  }
});

export const ChatMentionName = Mark.create({
  name: 'mentionName',
  inclusive: false,

  addAttributes() {
    return {
      userId: {default: 0, rendered: false}
    };
  },

  parseHTML() {
    return [{
      tag: 'a.follow[data-follow]',
      getAttrs: (element) => ({userId: element.getAttribute('data-follow')})
    }];
  },

  renderHTML({mark, HTMLAttributes}) {
    return ['a', mergeAttributes(HTMLAttributes, {
      'class': 'follow',
      'data-follow': `${mark.attrs.userId}`,
      'href': `#${mark.attrs.userId}`
    }), 0];
  }
});

export const ChatSubscript = Mark.create({
  name: 'subscript',
  excludes: 'superscript code formattedDate',

  parseHTML() {
    return [{tag: 'sub'}, {style: 'vertical-align=sub'}];
  },

  renderHTML({HTMLAttributes}) {
    return ['sub', mergeAttributes(HTMLAttributes, {class: 'chat-input-subscript'}), 0];
  }
});

export const ChatSuperscript = Mark.create({
  name: 'superscript',
  excludes: 'subscript code formattedDate',

  parseHTML() {
    return [{tag: 'sup'}, {style: 'vertical-align=super'}];
  },

  renderHTML({HTMLAttributes}) {
    return ['sup', mergeAttributes(HTMLAttributes, {class: 'chat-input-superscript'}), 0];
  }
});

/**
 * `@tiptap/extension-link` shipped autolinking, link-on-paste and click
 * handling — all of them disabled here — plus `linkifyjs` for the autolinking
 * nobody enabled. What the composer actually uses is this schema: the mark is
 * applied through `setMark`/`unsetMark`, extended with `richAnchorName` in
 * `attributes.ts`, and read back by the Telegram serializer.
 *
 * The href whitelist must survive: it is what stops a pasted
 * `<a href="javascript:…">` from becoming a link. It is now the same protocol
 * list the link dialog validates against, and it keeps upstream's contract of
 * letting relative hrefs through (see `chatInputEditorUpstreamContracts`).
 */
const LINK_HTML_ATTRIBUTES = {
  rel: 'noopener noreferrer nofollow',
  target: '_blank'
};

export const ChatLink = Mark.create({
  name: 'link',
  priority: 1000,
  keepOnSplit: false,
  exitable: true,
  inclusive: false,

  addAttributes() {
    return {
      href: {default: null},
      target: {default: LINK_HTML_ATTRIBUTES.target},
      rel: {default: LINK_HTML_ATTRIBUTES.rel},
      class: {default: null},
      title: {default: null}
    };
  },

  parseHTML() {
    return [{
      tag: 'a[href]',
      getAttrs: (element) => (
        typeof(element) !== 'string' && isAllowedLinkHref(element.getAttribute('href')) ? null : false
      )
    }];
  },

  renderHTML({HTMLAttributes}) {
    return ['a', mergeAttributes(
      LINK_HTML_ATTRIBUTES,
      isAllowedLinkHref(HTMLAttributes.href) ? HTMLAttributes : {...HTMLAttributes, href: ''}
    ), 0];
  }
});
