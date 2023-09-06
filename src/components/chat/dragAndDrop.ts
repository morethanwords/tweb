/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import generatePathData from '../../helpers/generatePathData';
import {FormatterArguments, i18n, LangPackKey} from '../../lib/langPack';
import Icon from '../icon';

export default class ChatDragAndDrop {
  container: HTMLDivElement;
  svg: SVGSVGElement;
  outlineWrapper: HTMLDivElement;
  path: SVGPathElement;

  constructor(appendTo: HTMLElement, private options: {
    icon?: Icon,
    header: LangPackKey,
    headerArgs?: FormatterArguments,
    subtitle?: LangPackKey,
    onDrop: (e: DragEvent) => void
  }) {
    this.container = document.createElement('div');
    this.container.classList.add('drop', 'z-depth-1');

    this.outlineWrapper = document.createElement('div');
    this.outlineWrapper.classList.add('drop-outline-wrapper');

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('drop-outline');

    this.path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.path.classList.add('drop-outline-path');

    let dropIcon: HTMLElement;
    if(options.icon) {
      dropIcon = document.createElement('div');
      dropIcon.classList.add('drop-icon');
      dropIcon.append(Icon(options.icon));
      this.container.classList.add('has-icon');
    }

    const dropHeader = document.createElement('div');
    dropHeader.classList.add('drop-header');
    dropHeader.append(i18n(options.header, options.headerArgs));

    let dropSubtitle: HTMLElement;
    if(options.subtitle) {
      dropSubtitle = document.createElement('div');
      dropSubtitle.classList.add('drop-subtitle');
      dropSubtitle.append(i18n(options.subtitle));
    }

    this.svg.append(this.path);
    this.outlineWrapper.append(this.svg);

    this.container.append(...[dropIcon, dropHeader, dropSubtitle, this.outlineWrapper].filter(Boolean));
    appendTo.append(this.container);

    this.container.addEventListener('dragover', this.onDragOver);
    this.container.addEventListener('dragleave', this.onDragLeave);
    this.container.addEventListener('drop', this.onDrop);
  }

  onDragOver = (e: DragEvent) => {
    this.container.classList.add('is-dragover');
    // SetTransition(this.container, 'is-dragover', true, 500);
  };

  onDragLeave = (e: DragEvent) => {
    this.container.classList.remove('is-dragover');
    // SetTransition(this.container, 'is-dragover', false, 500);
  };

  onDrop = (e: DragEvent) => {
    this.options.onDrop(e);
  };

  destroy() {
    delete this.options;
    this.container.remove();
    this.container.removeEventListener('dragover', this.onDragOver);
    this.container.removeEventListener('dragleave', this.onDragLeave);
    this.container.removeEventListener('drop', this.onDrop);
  }

  setPath() {
    const rect = this.outlineWrapper.getBoundingClientRect();
    this.svg.setAttributeNS(null, 'preserveAspectRatio', 'none');
    this.svg.setAttributeNS(null, 'viewBox', `0 0 ${rect.width} ${rect.height}`);
    this.svg.setAttributeNS(null, 'width', `${rect.width}`);
    this.svg.setAttributeNS(null, 'height', `${rect.height}`);

    const radius = 10;
    // const strokeWidth = 2;
    const sizeX = rect.width - radius;
    const sizeY = rect.height - radius;
    const pos = radius / 2;
    const d = generatePathData(pos, pos, sizeX, sizeY, radius, radius, radius, radius);
    this.path.setAttributeNS(null, 'd', d);
  }
}
