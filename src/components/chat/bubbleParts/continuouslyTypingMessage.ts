import {animate} from '../../../helpers/animation';
import styles from './continuouslyTypingMessage.module.scss';


type WrapContinuouslyTypingMessageArgs = {
  root: Node;
  prevPosition?: number;
};

const TARGET_TIME_TO_WRITE = 3000;

const BASE_DELAY = 60 * 1_000 / (2_000 * 5); // 2_000wpm
const DELAY_VARIATION = 0.3;

const SCROLL_VIEW_DELAY = 200;

// Try to write it with the base speed of 2000wpm or burst it in 3 seconds if it's a long message
function getRandomDelay(targetDelay: number) {
  const delay = Math.min(BASE_DELAY, targetDelay);
  return delay + Math.random() * delay * DELAY_VARIATION;
}

export function wrapContinuouslyTypingMessage({root, prevPosition = -1}: WrapContinuouslyTypingMessageArgs) {
  const initialTreeWalker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);

  const initialNodes: Node[] = [];

  while(initialTreeWalker.nextNode()) {
    initialNodes.push(initialTreeWalker.currentNode);
  }

  let currentPositionMax = -1;

  for(const node of initialNodes) {
    if(node.nodeType === Node.TEXT_NODE) {
      const chars = node.textContent.split('').map(char => {
        const span = document.createElement('span');
        span.textContent = char;
        currentPositionMax++;
        return span;
      });
      const fragment = document.createDocumentFragment();
      fragment.append(...chars);
      node.parentNode?.replaceChild(fragment, node);
    }
  }

  let currentNodeIdx = 0;

  const allNodesTreeWalker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);

  const allNodes: Node[] = [];


  {
    let position = 0;

    while(allNodesTreeWalker.nextNode()) {
      const node = allNodesTreeWalker.currentNode;
      allNodes.push(node);

      if(node.nodeType === Node.TEXT_NODE) {
        position += node.textContent.length;
      } else if(node instanceof Element && position > prevPosition) {
        node.classList.add(styles.hidden);
      }

      if(position <= prevPosition) {
        currentNodeIdx++;
      }
    }
  }

  let
    nextTime = performance.now(),
    nextScrollTime = performance.now() + SCROLL_VIEW_DELAY,
    lastElement: Element,
    cleaned = false
  ;

  function clean() {
    cleaned = true;
  };

  function typeNext() {
    result.currentPosition++;

    let stillHere = true;
    for(; result.currentNodeIdx < allNodes.length && stillHere; result.currentNodeIdx++) {
      const node = allNodes[result.currentNodeIdx];

      if(node instanceof Element) {
        lastElement = node;
        node.classList.remove(styles.hidden);
      }

      if(node.nodeType === Node.TEXT_NODE && node.textContent.length) {
        stillHere = false;
      }
    }

    if(result.currentNodeIdx >= allNodes.length) {
      clean();
    }
  }

  const targetDelay = TARGET_TIME_TO_WRITE / (currentPositionMax - prevPosition);

  animate(() => {
    if(cleaned) return false;

    const now = performance.now();

    while(now > nextTime) {
      typeNext();
      nextTime = nextTime + getRandomDelay(targetDelay);
    }

    if(now > nextScrollTime) {
      lastElement.scrollIntoView({behavior: 'smooth', block: 'center'});
      nextScrollTime = now + SCROLL_VIEW_DELAY;
    }

    return true;
  });

  const result = {
    allNodes,
    clean,
    currentPosition: prevPosition,
    currentNodeIdx
  };

  return result;
}
