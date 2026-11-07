import type {WidgetButtonTokens, WidgetTheme, WidgetThemeKey} from 'widget-sandbox/host/widget-host';
import {ColorRgb, ColorRgba, hexToRgb, mixColors, rgbaToHexa, rgbaToRgb} from '@helpers/color';
import classNames from '@helpers/string/classNames';
import {getPageButtonClasses, getPageButtonRowClasses} from '@components/instantViewFormatting';

/**
 * The chat's palette for a widget (docs/sdk-v1.md §2.3, §2.4): the colours of the bubble it sits in, as the bubble
 * resolves them — incoming or outgoing, the chat's own theme, night mode — so read from an element inside it. Every
 * key is `#rrggbb`; a translucent colour is laid over the bubble. Its text tokens are a message's text: the chat's
 * text size, its line height and its inset in the bubble.
 */

/** Each key from the first custom property the element resolves; a bubble remaps the generic ones to its own. */
const SOURCES: [WidgetThemeKey, string[]][] = [
  ['bg_color', ['--message-background-color', '--surface-color']],
  ['text_color', ['--primary-text-color']],
  ['hint_color', ['--secondary-text-color']],
  ['link_color', ['--link-color', '--primary-color']],
  ['button_color', ['--primary-color']],
  ['accent_text_color', ['--primary-color']],
  ['subtitle_text_color', ['--secondary-text-color']],
  ['destructive_text_color', ['--danger-color']],
  ['section_header_text_color', ['--primary-color']],
  ['section_separator_color', ['--border-color']]
];

/** The bubble's second surface (a quote, an inline button): its accent this strong over its background. */
const SECONDARY_SURFACE_WEIGHT = .1;

let context: CanvasRenderingContext2D;

type ChatThemeWatch = {observer: MutationObserver, listeners: Set<() => void>};
const chatThemeWatches = new WeakMap<HTMLElement, ChatThemeWatch>();

/**
 * Calls `onChange` whenever the chat `element` sits in applies its theme variables to itself: its own theme, night
 * mode — which a chat does once its wallpaper is drawn, after `theme_changed`, so a palette read then is the old
 * one. Returns what stops it; nothing outside a chat. One observer per chat, however many widgets it has.
 */
export function watchChatTheme(element: HTMLElement, onChange: () => void): (() => void) | undefined {
  const chat = element.closest<HTMLElement>('.chat');
  if(!chat) return;
  let watch = chatThemeWatches.get(chat);
  if(!watch) {
    const listeners = new Set<() => void>();
    const observer = new MutationObserver(() => listeners.forEach((listener) => listener()));
    // the theme's variables are set inline on the chat's container (themeController.applyTheme)
    observer.observe(chat, {attributes: true, attributeFilter: ['style']});
    chatThemeWatches.set(chat, watch = {observer, listeners});
  }

  watch.listeners.add(onChange);
  return () => {
    watch.listeners.delete(onChange);
    if(watch.listeners.size) return;
    watch.observer.disconnect();
    chatThemeWatches.delete(chat);
  };
}

/** Any CSS colour as RGBA, by letting a canvas parse it; undefined for what is not a colour. */
function parseColor(value: string): ColorRgba {
  if(!value) return;
  context ??= document.createElement('canvas').getContext('2d');
  const probe = '#010203';
  context.fillStyle = probe;
  context.fillStyle = value;
  const parsed = context.fillStyle as string;
  if(parsed === probe && value.toLowerCase() !== probe) return;
  if(parsed[0] === '#') {
    return [...hexToRgb(parsed), 1];
  }

  // `color(srgb r g b / a)`, channels from 0 to 1: what Chromium and WebKit give back for a `color-mix()`
  const scale = parsed.startsWith('color(') ? 255 : 1;
  const match = parsed.match(/[\d.]+/g);
  return match && [
    Math.round(+match[0] * scale),
    Math.round(+match[1] * scale),
    Math.round(+match[2] * scale),
    match[3] === undefined ? 1 : +match[3]
  ];
}

/** The buttons read off a probe (getButtonTokens), by what they depend on: few kinds per chat, many widgets. */
const buttonTokens = new Map<string, WidgetButtonTokens>();
const MAX_BUTTON_TOKENS = 32;

const px = (value: string) => {
  const number = parseFloat(value);
  return Number.isFinite(number) ? +number.toFixed(2) + 'px' : undefined;
};

/**
 * The client's own button where the widget is (docs/sdk-v1.md §2.4): the one a rich message has in its rows of buttons
 * (`.PageButton`, its default look), read off one put in the widget's place — the bubble decides its colours (a tint of
 * the accent in an outgoing one, a shade in an incoming one) — with its height, rounding, padding and font (that of the
 * message's text, in the generic family the widget's grammar takes). `key` is what the colours and sizes depend on.
 */
function getButtonTokens(element: HTMLElement, key: string, toHex: (color: ColorRgba) => string) {
  let tokens = buttonTokens.get(key);
  if(tokens) return tokens;
  // a button of a row, as a rich message has them (the row rounds its buttons), at the scale its page sets and in the
  // message's text, which a rich message's buttons take (the block's own font is not the message's)
  const row = document.createElement('div');
  row.className = classNames(...getPageButtonRowClasses());
  row.style.cssText = '--iv-scale:1;font-size:var(--messages-text-size);line-height:var(--line-height);' +
    'position:absolute;visibility:hidden;pointer-events:none;';
  const probe = document.createElement('button');
  probe.className = classNames(...getPageButtonClasses());
  row.append(probe);
  element.append(row);
  const style = getComputedStyle(probe);
  const color = (value: string) => {
    const parsed = parseColor(value);
    return parsed && toHex(parsed);
  };
  const lineHeight = px(style.lineHeight);
  tokens = {
    bg: color(style.backgroundColor),
    text: color(style.color),
    radius: px(style.borderTopLeftRadius),
    font: `${style.fontWeight} ${px(style.fontSize)}${lineHeight ? '/' + lineHeight : ''} system-ui, sans-serif`,
    padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(px).join(' '),
    height: px(style.minHeight)
  };
  row.remove();
  if(buttonTokens.size >= MAX_BUTTON_TOKENS) buttonTokens.clear();
  buttonTokens.set(key, tokens);
  return tokens;
}

export function getWidgetTheme(element: HTMLElement, colorScheme: WidgetTheme['colorScheme']): WidgetTheme {
  const style = getComputedStyle(element);
  const resolve = (properties: string[]) => {
    for(const property of properties) {
      const color = parseColor(style.getPropertyValue(property).trim());
      if(color) return color;
    }
  };

  const background = resolve(SOURCES[0][1]);
  const backgroundRgb = background && background.slice(0, 3) as ColorRgb;
  const toHex = (color: ColorRgba) => {
    const rgb = color[3] < 1 && backgroundRgb ? rgbaToRgb(color, backgroundRgb) : color.slice(0, 3) as ColorRgb;
    return rgbaToHexa(rgb);
  };

  const params: WidgetTheme['params'] = {};
  for(const [key, properties] of SOURCES) {
    const color = resolve(properties);
    if(color) params[key] = toHex(color);
  }

  // the surfaces a bubble has none of take its background, so Mini Apps code reads right
  if(params.bg_color) {
    params.section_bg_color = params.header_bg_color = params.bottom_bar_bg_color = params.bg_color;
  }

  params.button_text_color = '#ffffff';
  const accent = resolve(['--primary-color']);
  if(accent && backgroundRgb) {
    params.secondary_bg_color = rgbaToHexa(mixColors(accent.slice(0, 3) as ColorRgb, backgroundRgb, SECONDARY_SURFACE_WEIGHT));
  }

  const number = (property: string) => parseFloat(style.getPropertyValue(property)) || undefined;
  const text: WidgetTheme['text'] = {
    fontSize: number('--messages-text-size'),
    lineHeight: number('--line-height'),
    padding: style.getPropertyValue('--widget-text-padding').trim() || undefined
  };
  return {
    colorScheme,
    params,
    // an incoming bubble and an outgoing one have buttons of their own looks, a night theme its colours, a text size its
    // font
    button: getButtonTokens(element, [
      !!element.closest('.bubble.is-in'),
      params.bg_color,
      params.text_color,
      params.button_color,
      text.fontSize,
      text.lineHeight,
      document.documentElement.className
    ].join(), toHex),
    text
  };
}
