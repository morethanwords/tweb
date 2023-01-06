/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {hexaToHsla} from '../helpers/color';
import {TOPIC_COLORS} from '../lib/mtproto/mtproto_config';
import wrapAbbreviation from '../lib/richTextProcessor/wrapAbbreviation';

let svg: SVGSVGElement, span: HTMLElement, defs: HTMLElement;
const hadColors: Map<number, string> = new Map();
export default function topicAvatar(color: number, content: string) {
  if(!svg) {
    defs = document.getElementById('svg-defs') as HTMLElement;

    const ns = 'http://www.w3.org/2000/svg';

    svg = document.createElementNS(ns, 'svg');
    svg.setAttributeNS(null, 'width', '26');
    svg.setAttributeNS(null, 'height', '26');
    svg.setAttributeNS(null, 'viewBox', '0 0 26 26');
    svg.classList.add('topic-icon-svg');

    const use = document.createElementNS(ns, 'use');
    use.setAttributeNS(null, 'href', '#topic-icon');
    svg.append(use);

    span = document.createElement('span');
    span.classList.add('topic-icon', 'avatar-like');

    const contentSpan = document.createElement('span');
    contentSpan.classList.add('topic-icon-content');
    span.append(svg, contentSpan);
  }

  if(!color) {
    console.error('NO TOPIC ICON COLOR!');
    color = TOPIC_COLORS[0];
  }

  if(!content) {
    console.error('NO TOPIC NAME!');
    content = '';
  }

  const hex = color.toString(16);

  const gradientId = `topic-icon-gradient-${color}`;
  let strokeColor = hadColors.get(color);
  if(!strokeColor) {
    const {h, s, l, a} = hexaToHsla('#' + hex);
    defs.insertAdjacentHTML('beforeend', `
      <linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
        <stop style="stop-color: #${hex};" offset="0%" />
        <stop style="stop-color: hsla(${h}, ${s}%, ${Math.max(0, l - 30)}%, ${a});" offset="100%" />
      </linearGradient>
    `);

    hadColors.set(color, strokeColor = `hsla(${h}, ${s}%, ${Math.max(0, l - 40)}%, ${a})`);
  }

  const clone = span.cloneNode(true) as typeof span;
  (clone.firstElementChild as HTMLElement).style.fill = `url(#${gradientId})`;
  // (clone.firstElementChild as HTMLElement).style.stroke = `var(--peer-avatar-${color}-filled)`;
  (clone.firstElementChild as HTMLElement).style.stroke = strokeColor;
  clone.lastElementChild.append(wrapAbbreviation(content, true));
  return clone;
}
