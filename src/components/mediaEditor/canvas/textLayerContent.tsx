import {batch, createEffect, createMemo, on, onCleanup, onMount} from 'solid-js';

import createElementFromMarkup from '../../../helpers/createElementFromMarkup';
import {i18n} from '../../../lib/langPack';

import {ResizableLayerProps, TextLayerInfo, TextRenderingInfoLine} from '../types';
import {fontInfoMap, getContrastColor, log} from '../utils';
import {HistoryItem, useMediaEditorContext} from '../context';

import {ResizableContainer} from './resizableLayers';

export default function TextLayerContent(props: ResizableLayerProps) {
  const {editorState, mediaState, actions} = useMediaEditorContext();

  if(!props.layer.textInfo) return;

  const onFocus = () => {
    batch(() => {
      editorState.selectedResizableLayer = props.layer.id;
      editorState.currentTextLayerInfo = {...props.layer.textInfo};
    });
  };

  const fontInfo = () => fontInfoMap[props.layer.textInfo.font];

  function deleteThisLayer() {
    const layers = mediaState.resizableLayers;
    const idx = layers.findIndex(layer => layer.id === props.layer.id);
    if(idx < 0) return;
    const deletedLayer = layers.splice(idx, 1)[0];
    deletedLayer.textRenderingInfo = undefined;

    actions.pushToHistory({
      path: ['resizableLayers', idx],
      newValue: HistoryItem.RemoveArrayItem,
      oldValue: deletedLayer,
      findBy: {
        id: deletedLayer.id
      }
    });
  }

  function updateBackground() {
    contentEditable.childNodes.forEach((childNode) => {
      if(childNode instanceof HTMLDivElement && !childNode.hasAttributes()) {
        childNode.querySelectorAll('*').forEach((element) => {
          const node = document.createTextNode(element.textContent);
          element.replaceWith(node);
        });
      } else {
        const div = document.createElement('div');
        div.textContent = childNode.textContent;
        childNode.replaceWith(div);
      }
    });
    if(!contentEditable.textContent) {
      contentEditable.innerHTML = '<div></div>';

      // Firefox cursor reset
      const child = contentEditable.children[0];
      const range = document.createRange();
      const sel = window.getSelection();

      range.setStart(child, 0);
      range.collapse(true);

      sel.removeAllRanges();
      sel.addRange(range);
    }

    // Firefox puts the cursor outside the inner divs and messes up everything
    const selection = window.getSelection();
    if(selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if(range.startContainer === contentEditable && range.startOffset === 0) {
        const innerDiv = contentEditable.children[0];
        const innerDivRange = document.createRange();
        innerDivRange.selectNodeContents(innerDiv);
        innerDivRange.collapse(false); // Collapse to the end of the inner div

        selection.removeAllRanges();
        selection.addRange(innerDivRange);
      }
    }

    container.querySelector('.media-editor__text-layer-background')?.remove();
    const lines = getLinesRenderingInfo(contentEditable, props.layer.textInfo.alignment);
    const path = createTextBackgroundPath(lines);

    if(props.layer.textInfo.style === 'background') updateBackgroundStyle(container, path.join(' '), props.layer.textInfo);
    if(props.layer.textInfo.style === 'outline') updateOutlineStyle(container, contentEditable, props.layer.textInfo);

    props.layer.textRenderingInfo =  {
      width: container.clientWidth,
      height: container.clientHeight,
      path,
      lines
    };
  }

  function selectAll() {
    const range = document.createRange();
    range.selectNodeContents(contentEditable.children[0]);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  createEffect(() => {
    updateBackground();
  });

  const isThisLayerSelected = createMemo(() => props.layer.id === editorState.selectedResizableLayer);

  onMount(() => {
    if(isThisLayerSelected()) selectAll();
  });


  createEffect(() => {
    if(isThisLayerSelected()) {
      onCleanup(() => {
        if(!contentEditable.innerText.trim()) {
          deleteThisLayer();
        }
      })
    }
  });

  createEffect(
    on(() => ({...editorState.currentTextLayerInfo}), () => {
      if(editorState.selectedResizableLayer !== props.layer.id) return;
      props.layer.textInfo = {...editorState.currentTextLayerInfo};
    })
  );

  onMount(() => {
    container.addEventListener('dragstart', (e: Event) => {
      e.preventDefault();
    });
  });

  let container: HTMLDivElement;
  let contentEditable: HTMLDivElement;

  const color = () => {
    if(props.layer.textInfo.style === 'normal') return props.layer.textInfo.color;
    return getContrastColor(props.layer.textInfo.color);
  };

  const intialContent = (() => {
    const layerInfo = props.layer.textRenderingInfo;
    if(!layerInfo) return <div>{i18n('MediaEditor.TypeSomething')}</div>;
    return layerInfo.lines.map((line) => <div>{line.content}</div>);
  })();

  const children = (
    <div
      ref={container}
      class="media-editor__text-layer"
      classList={{
        'media-editor__text-layer--with-bg': props.layer.textInfo.style === 'background'
      }}
      style={{
        'color': color(),
        'font-size': props.layer.textInfo.size + 'px',
        'font-family': fontInfo().fontFamily,
        'font-weight': fontInfo().fontWeight,
        '--align-items': flexAlignMap[props.layer.textInfo.alignment]
      }}
    >
      <div
        ref={contentEditable}
        class="media-editor__text-layer-layout"
        contenteditable
        onInput={() => updateBackground()}
        onFocus={onFocus}
      >
        {intialContent}
      </div>
    </div>
  ); // Needs to be rendered here for hot reload to work properly

  return (
    <ResizableContainer layer={props.layer}>
      {children}
    </ResizableContainer>
  );
}

function getLinesRenderingInfo(linesContainer: HTMLDivElement, alignment: string): TextRenderingInfoLine[] {
  return Array.from(linesContainer.children).map((_child) => {
    const child = _child as HTMLElement;
    let offset = 0;
    if(alignment === 'left') {
      offset = 0;
    } else if(alignment === 'center') {
      offset = (linesContainer.clientWidth - child.clientWidth) / 2;
    } else {
      offset = linesContainer.clientWidth - child.clientWidth;
    }
    return {
      left: offset,
      right: offset + child.clientWidth,
      content: child.innerText,
      height: child.clientHeight
    };
  });
}

function createTextBackgroundPath(lines: TextRenderingInfoLine[]) {
  const first = lines[0];

  const rounding = first.height * 0.3;

  const arcParams = (r: number, s: number = 1) => [r, r, 0, 0, s];

  const path = [];
  path.push('M', first.left, rounding);

  path.push('A', ...arcParams(rounding), first.left + rounding, 0);
  path.push('L', first.right - rounding, 0);
  path.push('A', ...arcParams(rounding), first.right, rounding);

  let prevPosition = first;
  let prevY = first.height;

  for(let i = 1; i < lines.length; i++) {
    const position = lines[i];

    const diffSign = position.right > prevPosition.right ? 1 : -1;
    const diff = Math.min(Math.abs((position.right - prevPosition.right) / 2), rounding) * diffSign;
    const currentRounding = Math.abs(diff);

    path.push('L', prevPosition.right, prevY - currentRounding);
    path.push('A', ...arcParams(currentRounding, diffSign === 1 ? 0 : 1), prevPosition.right + diff, prevY);
    path.push('L', position.right - diff, prevY);
    path.push('A', ...arcParams(currentRounding, diffSign === 1 ? 1 : 0), position.right, prevY + currentRounding);

    prevY += position.height;
    prevPosition = position;
  }

  path.push('L', prevPosition.right, prevY - rounding);
  path.push('A', ...arcParams(rounding), prevPosition.right - rounding, prevY);
  path.push('L', prevPosition.left + rounding, prevY);
  path.push('A', ...arcParams(rounding), prevPosition.left, prevY - rounding);

  const last = lines[lines.length - 1];
  prevY -= last.height;
  for(let i = lines.length - 2; i >= 0; i--) {
    const position = lines[i];

    const diffSign = position.left > prevPosition.left ? 1 : -1;
    const diff = Math.min(Math.abs((position.left - prevPosition.left) / 2), rounding) * diffSign;
    const currentRounding = Math.abs(diff);

    path.push('L', prevPosition.left, prevY + currentRounding);
    path.push('A', ...arcParams(currentRounding, diffSign !== 1 ? 0 : 1), prevPosition.left + diff, prevY);
    path.push('L', position.left - diff, prevY);
    path.push('A', ...arcParams(currentRounding, diffSign !== 1 ? 1 : 0), position.left, prevY - currentRounding);

    prevY -= position.height;
    prevPosition = position;
  }

  return path;
}

function updateBackgroundStyle(container: HTMLDivElement, path: string, info: TextLayerInfo) {
  const svg = createElementFromMarkup(`
    <svg width="${container.clientWidth}" height="${container.clientHeight}" viewBox="0 0 ${container.clientWidth} ${container.clientHeight}">
      <path d="${path}" fill="${info.color}" />
    </svg>
  `);
  svg.classList.add('media-editor__text-layer-background');
  container.prepend(svg);

  return path;
}

function updateOutlineStyle(container: HTMLDivElement, contentEditable: HTMLDivElement, info: TextLayerInfo) {
  const fontInfo = fontInfoMap[info.font];
  function updateSvg(div: HTMLDivElement) {
    div.querySelector('.media-editor__text-layer-svg-outline')?.remove();
    const stretch = info.size * 0.5;
    const w = div.clientWidth + stretch;
    const h = div.clientHeight + stretch;
    const svg = createElementFromMarkup(`
      <div class="media-editor__text-layer-svg-outline" style="width: ${w}px; height: ${h}px;">
        <svg style="width: ${w}px; height: ${h}px;" viewBox="${-stretch / 2} 0 ${div.clientWidth + stretch / 2} ${div.clientHeight + stretch}">
          <text
            x="${info.size * 0.2}"
            y="${info.size * 1.33 * fontInfo.baseline}"
            style="font-size:${info.size}px;stroke:${info.color};stroke-width:${div.clientHeight * 0.15}px;font-family:${fontInfo.fontFamily};font-weight:${fontInfo.fontWeight};">
            ${div.innerText}
          </text>
        </svg>
      </div>
    `);
    div.prepend(svg);
  }

  const bgDiv = document.createElement('div');
  bgDiv.classList.add('media-editor__text-layer-background', 'media-editor__text-layer-background--as-layout');
  bgDiv.innerHTML = contentEditable.innerHTML;
  container.prepend(bgDiv);
  Array.from(bgDiv.children).forEach((line) => {
    if(line instanceof HTMLDivElement) updateSvg(line);
  });
}

const flexAlignMap: Record<string, string> = {
  left: 'start',
  center: 'center',
  right: 'end'
};
