import {onCleanup} from 'solid-js';
import {Middleware} from '../../../helpers/middleware';
import {TextWithEntities} from '../../../layer';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE} from '../../../lib/mtproto/mtproto_config';
import rootScope from '../../../lib/rootScope';
import wrapFolderTitle from '../../wrappers/folderTitle';
import styles from './styles.module.scss';


export async function fetchDialogFilters() {
  const filters = await rootScope.managers.filtersStorage.getDialogFilters();

  return filters
  .filter(filter => filter.id !== FOLDER_ID_ARCHIVE && filter.id !== FOLDER_ID_ALL)
  .sort((a, b) => {
    if(!a.id || !b.id) return 0;
    return a?.localId - b?.localId;
  });
}

export function wrapFolderTitleInSpan(title: TextWithEntities.textWithEntities, middleware: Middleware) {
  const span: HTMLSpanElement = document.createElement('span');
  const fragment = wrapFolderTitle(title, middleware, true);

  span.append(fragment);

  const treeWalker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);

  const nodes: Node[] = [];
  const charSpansGroups: HTMLElement[][] = [];

  while(treeWalker.nextNode()) {
    nodes.push(treeWalker.currentNode);
  }

  for(const node of nodes) {
    const fragment = document.createDocumentFragment();

    const charSpans = node.nodeValue.split('').map(char => {
      const charSpan = document.createElement('span');
      charSpan.innerText = char;
      return charSpan;
    });

    charSpansGroups.push(charSpans);
    fragment.append(...charSpans);

    node.parentNode.replaceChild(fragment, node);
  }

  return {
    span,
    charSpansGroups
  };
}

export function highlightTextNodes(nodeGroups: HTMLElement[][], indicies: number[]) {
  let acc = 0;

  const toCleanup: HTMLElement[] = [];

  for(const nodeGroup of nodeGroups) {
    const n = nodeGroup.length;

    const localIndicies = indicies.filter(i => i >= acc && i < acc + n).map(i => i - acc);
    const m = localIndicies.length;

    acc += n;

    for(let i = 0; i < m; i++) {
      let j = i;
      while(j < m - 1 && localIndicies[j + 1] - 1 === localIndicies[j]) j++;

      if(j === i) {
        const li = localIndicies[i];
        const nodeSingle = nodeGroup[li];
        nodeSingle.classList.add(styles.Char, styles.single);
        toCleanup.push(nodeSingle);
        continue;
      }

      const nodeStart = nodeGroup[localIndicies[i]];
      const nodeEnd = nodeGroup[localIndicies[j]];

      nodeStart.classList.add(styles.Char, styles.start);
      nodeEnd.classList.add(styles.Char, styles.end);

      toCleanup.push(nodeStart, nodeEnd);

      for(let k = i + 1; k < j; k++) {
        const nodeMiddle = nodeGroup[localIndicies[k]];
        nodeMiddle.classList.add(styles.Char, styles.middle);
        toCleanup.push(nodeMiddle);
      }

      i = j;
    }
  }

  onCleanup(() => {
    toCleanup.forEach(el => {
      el.className = '';
    });
  });
}
