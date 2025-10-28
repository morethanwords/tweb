import {animate} from '../../../helpers/animation';
import styles from './continuouslyTypingMessage.module.scss';


type WrapContinuouslyTypingMessageArgs = {
  root: Node;
  bubble: HTMLElement;
  isEnd?: boolean;
  prevPosition?: number;
};

type Result = {
  allNodes: Node[];
  bubble: HTMLElement;
  clean: () => void;
  currentPosition: number;
  currentNodeIdx: number;
  nextIsEnd?: boolean;
};

export function wrapContinuouslyTypingMessage({root, bubble, isEnd = false, prevPosition = -1}: WrapContinuouslyTypingMessageArgs): Result {
  const maxPosition = getMaxPosition(root);

  const {allNodes, currentNodeIdx} = hidePrevElements(root, prevPosition);

  let
    lastElement: Element,
    lastTextNode: Node,
    cleaned = false,
    ended = false
  ;

  function clean() {
    cleaned = true;
  };

  function onEnd() {
    if(ended) return;
    ended = true;

    if(!isEnd) appendDots(lastTextNode);

    animate(() => {
      lastElement?.scrollIntoView({behavior: 'smooth', block: 'center'});
    });
  }

  const result = {
    allNodes,
    bubble,
    clean,
    currentPosition: prevPosition,
    currentNodeIdx,
    nextIsEnd: isEnd
  };

  runAnimation({
    typeNext: () => typeNext({
      result,
      setLastElement: (element) => lastElement = element,
      setLastTextNode: (node) => lastTextNode = node,
      onEnd
    }),
    getLastElement: () => lastElement,
    isCleaned: () => cleaned,
    maxPosition,
    prevPosition
  });

  return result;
}


function getMaxPosition(root: Node) {
  const initialTreeWalker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);

  const initialNodes: Node[] = [];

  while(initialTreeWalker.nextNode()) {
    initialNodes.push(initialTreeWalker.currentNode);
  }

  let position = -1;

  for(const node of initialNodes) {
    if(node.nodeType === Node.TEXT_NODE) {
      const chars = node.textContent.split('').map(char => {
        const span = document.createElement('span');
        span.textContent = char;
        position++;
        return span;
      });
      const fragment = document.createDocumentFragment();
      fragment.append(...chars);
      node.parentNode?.replaceChild(fragment, node);
    }
  }

  return position;
}


function hidePrevElements(root: Node, toPosition: number) {
  let currentNodeIdx = 0;

  const allNodesTreeWalker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
  const allNodes: Node[] = [];

  let position = 0;

  while(allNodesTreeWalker.nextNode()) {
    const node = allNodesTreeWalker.currentNode;
    allNodes.push(node);

    if(node.nodeType === Node.TEXT_NODE) {
      position += node.textContent.length;
    } else if(node instanceof Element && position > toPosition) {
      node.classList.add(styles.hidden);
    }

    if(position <= toPosition) {
      currentNodeIdx++;
    }
  }

  return {
    allNodes,
    currentNodeIdx
  };
}


function appendDots(node: Node) {
  const parent = node.parentNode;
  if(!(parent instanceof Element)) return;

  const dots = document.createElement('span');
  dots.className = styles.Dots;
  dots.textContent = ' ';

  new Array(3).fill(null).forEach((_, idx) => {
    const dot = document.createElement('span');
    dot.textContent = '.';
    dot.classList.add(styles.Dot, styles['Dot' + (idx + 1)]);
    dots.appendChild(dot);
  });

  parent.appendChild(dots);
}


type TypeNextArgs = {
  result: Result;
  setLastElement: (element: Element) => void;
  setLastTextNode: (node: Node) => void;
  onEnd: () => void;
};

function typeNext({result, setLastElement, setLastTextNode, onEnd}: TypeNextArgs) {
  const {allNodes, clean} = result;
  result.currentPosition++;

  let stillHere = true;
  for(; result.currentNodeIdx < allNodes.length && stillHere; result.currentNodeIdx++) {
    const node = allNodes[result.currentNodeIdx];

    if(node instanceof Element) {
      setLastElement(node);
      node.classList.remove(styles.hidden);
    }

    if(node.nodeType === Node.TEXT_NODE && node.textContent.length) {
      setLastTextNode(node);
      stillHere = false;
    }
  }

  if(result.currentNodeIdx >= allNodes.length) {
    clean();
    onEnd();
  }
}


const BASE_DELAY = 60 * 1_000 / (800 * 5); // 800wpm
const MIN_DELAY = 60 * 1_000 / (1_500 * 5); // 1_500wpm
const DELAY_VARIATION = 0.3;

// Try to write it with the base speed of 800wpm or burst it in 5 seconds if it's a long message, maximum speed of 1500wpm overall
function getRandomDelay(targetDelay: number) {
  const delay = Math.max(MIN_DELAY, Math.min(BASE_DELAY, targetDelay));
  return delay + Math.random() * delay * DELAY_VARIATION;
}


const TARGET_TIME_TO_WRITE = 5000;

type RunAnimationArgs = {
  typeNext: () => void;
  isCleaned: () => boolean;
  getLastElement: () => Element;
  maxPosition: number;
  prevPosition: number;
};

function runAnimation({typeNext, isCleaned, getLastElement, maxPosition, prevPosition}: RunAnimationArgs) {
  const targetDelay = TARGET_TIME_TO_WRITE / (maxPosition - prevPosition);

  let nextTime = performance.now();

  animate(() => {
    if(isCleaned()) return false;

    const now = performance.now();

    while(now > nextTime && !isCleaned()) {
      typeNext();
      nextTime = nextTime + getRandomDelay(targetDelay);
    }

    getLastElement()?.scrollIntoView({behavior: 'instant', block: 'center'});

    return true;
  });
}
