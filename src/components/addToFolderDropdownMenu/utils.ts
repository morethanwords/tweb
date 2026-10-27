import {onCleanup} from 'solid-js';
import {Middleware} from '@helpers/middleware';
import {TextWithEntities} from '@layer';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {CustomEmojiRendererElement} from '@lib/customEmoji/renderer';
import {logger, LogTypes} from '@lib/logger';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE} from '@appManagers/constants';
import rootScope from '@lib/rootScope';
import {MyDialogFilter} from '@lib/storages/filters';
import wrapFolderTitle from '@components/wrappers/folderTitle';
import isRTL from '@helpers/string/isRTL';
import styles from '@components/addToFolderDropdownMenu/styles.module.scss';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';


export const log = logger('AddToFolderDropdownMenu', LogTypes.Debug);

export async function fetchDialogFilters() {
  const filters = await rootScope.managers.filtersStorage.getDialogFilters();

  return filters
  .filter(filter => filter.id !== FOLDER_ID_ARCHIVE && filter.id !== FOLDER_ID_ALL)
  .sort((a, b) => {
    if(!a.id || !b.id) return 0;
    return a?.localId - b?.localId;
  });
}

const p = (p: PeerId) => Math.abs(p);

export async function addToFilter(filter: MyDialogFilter, peerId: PeerId) {
  const managers = bindManagersToSession(rootScope.managers);
  log.debug('addToFilter before', filter);
  filter = {...filter};

  if(filter._ === 'dialogFilter') {
    filter.excludePeerIds = filter.excludePeerIds?.filter(excludedPeerId => p(excludedPeerId) !== p(peerId));
    filter.exclude_peers = filter.exclude_peers?.filter(inputPeer => p(getPeerId(inputPeer)) !== p(peerId));
  }

  const hasPinned = filter.pinnedPeerIds.find(pinnedPeerId => p(pinnedPeerId) === p(peerId));

  if(!hasPinned) {
    filter.includePeerIds = [...(filter.includePeerIds || []).filter(includedPeerId => p(includedPeerId) !== p(peerId)), peerId];
    filter.include_peers = [...(filter.include_peers || []).filter(inputPeer => p(getPeerId(inputPeer)) !== p(peerId)), await managers.appPeersManager.getInputPeerById(peerId)];
  }

  log.debug('addToFilter after', filter);

  await managers.filtersStorage.updateDialogFilter(filter);
}

export async function removeFromFilter(filter: MyDialogFilter, peerId: PeerId) {
  const managers = bindManagersToSession(rootScope.managers);
  log.debug('removeFromFilter before', filter);
  filter = {...filter};

  filter.includePeerIds = filter.includePeerIds?.filter(includedPeerId => p(peerId) !== p(includedPeerId));
  filter.include_peers = filter.include_peers?.filter(inputPeer => p(getPeerId(inputPeer)) !== p(peerId));

  filter.pinnedPeerIds = filter.pinnedPeerIds?.filter(pinnedPeerId => p(peerId) !== p(pinnedPeerId));
  filter.pinned_peers = filter.pinned_peers?.filter(inputPeer => p(getPeerId(inputPeer)) !== p(peerId));

  if(filter._ === 'dialogFilter') {
    filter.excludePeerIds = [...(filter.excludePeerIds || []).filter(excludedPeerId => p(excludedPeerId) !== p(peerId)), peerId];
    filter.exclude_peers = [...(filter.exclude_peers || []).filter(inputPeer => p(getPeerId(inputPeer)) !== p(peerId)), await managers.appPeersManager.getInputPeerById(peerId)];
  }

  log.debug('removeFromFilter after', filter);

  await managers.filtersStorage.updateDialogFilter(filter);
}

export function wrapFolderTitleInSpan(title: TextWithEntities.textWithEntities, middleware: Middleware) {
  const span: HTMLSpanElement = document.createElement('span');
  const fragment = wrapFolderTitle(title, middleware, true);

  span.append(fragment);
  // * the direction of the title's own text, as `dir="auto"` would find it - set outright, so the
  // * menu's direction does not override it and the highlighting can read it
  const rtl = isRTL(span.textContent);
  span.dir = rtl ? 'rtl' : 'ltr';

  const renderer: CustomEmojiRendererElement = span.querySelector('custom-emoji-renderer-element');
  renderer?.setTextColor('primary-text-color');

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
    charSpansGroups,
    rtl
  };
}

/** `rtl` - the title runs right to left, so a run of characters begins at its right end */
export function highlightTextNodes(nodeGroups: HTMLElement[][], indicies: number[], rtl?: boolean) {
  // * `styles.start` frames the left end of a run, `styles.end` the right one
  const [firstCharClass, lastCharClass] = rtl ? [styles.end, styles.start] : [styles.start, styles.end];
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

      nodeStart.classList.add(styles.Char, firstCharClass);
      nodeEnd.classList.add(styles.Char, lastCharClass);

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
