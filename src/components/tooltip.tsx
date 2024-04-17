/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import clamp from '../helpers/number/clamp';
import OverlayClickHandler from '../helpers/overlayClickHandler';
import classNames from '../helpers/string/classNames';
import {LangPackKey} from '../lib/langPack';
import {createRoot, createSignal, onMount, JSX} from 'solid-js';
import {Portal} from 'solid-js/web';
import {IconTsx} from './iconTsx';
import SetTransition from './singleTransition';

const KEEP_TOOLTIP = true;
const tooltipOverlayClickHandler = new OverlayClickHandler(undefined, true);
export default function showTooltip({
  element,
  container = element.parentElement,
  vertical,
  text,
  textElement,
  paddingX = 0,
  centerVertically,
  onClose,
  icon,
  auto
}: {
  element: HTMLElement,
  container?: HTMLElement,
  vertical: 'top' | 'bottom',
  text?: LangPackKey,
  textElement?: HTMLElement,
  paddingX?: number,
  centerVertically?: boolean,
  onClose?: () => void,
  icon?: Icon,
  auto?: boolean
}) {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const mountOn = document.body;
  let close: () => void;
  createRoot((dispose) => {
    const [getRect, setRect] = createSignal<DOMRect>();

    const getStyle = (): JSX.CSSProperties => {
      const css: JSX.CSSProperties = {
        'max-width': Math.min(containerRect.width - paddingX * 2, 320) + 'px'
      };

      const rect = getRect();
      if(!rect) {
        return css;
      }

      const minX = Math.min(containerRect.left + paddingX, containerRect.right);
      const maxX = Math.max(containerRect.left, containerRect.right - Math.min(containerRect.width, rect.width) - paddingX);

      const centerX = elementRect.left + (elementRect.width - rect.width) / 2;
      const left = clamp(centerX, minX, maxX);
      const verticalOffset = 12;
      if(vertical === 'top') css.top = (centerVertically ? elementRect.top + elementRect.height / 2 : elementRect.top) - rect.height - verticalOffset + 'px';
      else css.top = elementRect.bottom + verticalOffset + 'px';
      css.left = left + 'px';

      const notchCenterX = elementRect.left + (elementRect.width - 19) / 2;
      css['--notch-offset'] = notchCenterX - left + 'px';

      return css;
    };

    let div: HTMLDivElement;
    const tooltip = (
      <div
        ref={div}
        class={classNames('tooltip', 'tooltip-' + vertical, icon && 'tooltip-with-icon')}
        style={getStyle()}
      >
        <div class="tooltip-part tooltip-background"></div>
        <span class="tooltip-part tooltip-notch"></span>
        <div class="tooltip-part tooltip-text">
          {icon && <IconTsx icon={icon} class="tooltip-icon" />}
          {textElement}
        </div>
      </div>
    );

    <Portal mount={mountOn}>
      {tooltip}
    </Portal>

    onMount(() => {
      setRect(div.getBoundingClientRect());
      div.classList.add('mounted');
      SetTransition({
        element: div,
        className: 'is-visible',
        duration: 200,
        useRafs: 2,
        forwards: true
      });
    });

    let closed = false;
    const onToggle = (open: boolean) => {
      if(open) {
        return;
      }

      closed = true;
      clearTimeout(timeout);
      SetTransition({
        element: div,
        className: 'is-visible',
        duration: 200,
        forwards: false,
        onTransitionEnd: () => {
          onClose?.();
          dispose();
        }
      });
    };

    close = () => {
      if(closed) {
        return;
      }

      tooltipOverlayClickHandler.close();
    };

    const timeout = KEEP_TOOLTIP && !auto ? 0 : window.setTimeout(close, 3000);

    Promise.resolve().then(() => {
      tooltipOverlayClickHandler.open(mountOn);
      tooltipOverlayClickHandler.addEventListener('toggle', onToggle, {once: true});
    });
  });

  return {close};
}
