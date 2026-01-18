import {animate} from '@helpers/animation';
import styles from '@components/chat/bubbleParts/continuouslyTypingMessage.module.scss';


type WrapContinuouslyTypingMessageArgs = {
  root: Node;
  bubble: HTMLElement;
  scrollable: HTMLElement;
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

export function wrapContinuouslyTypingMessage({root, bubble, scrollable, isEnd = false, prevPosition = -1}: WrapContinuouslyTypingMessageArgs): Result {
  const {
    maxPosition,
    nodeContents,
    allNodes,
    currentNodeIdx
  } = processNodeTree({root, prevPosition});

  let
    lastTextNode: Node,
    cleaned = false,
    ended = false
  ;

  function clean() {
    cleaned = true;
    allNodes.forEach(node => nodeContents.delete(node));
  };

  function onEnd() {
    if(ended) return;
    ended = true;

    if(!isEnd) appendDots(lastTextNode);
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
    scrollable,
    typeNext: (length) => typeNext({
      result,
      setLastTextNode: (node) => lastTextNode = node,
      nodeContents,
      onEnd,
      length
    }),
    isCleaned: () => cleaned,
    maxPosition,
    prevPosition
  });

  return result;
}


type ProcessNodeTreeArgs = {
  root: Node;
  prevPosition: number;
};

function processNodeTree({root, prevPosition}: ProcessNodeTreeArgs) {
  const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);

  const allNodes: Node[] = [];
  const nodeContents = new WeakMap<Node, string>();

  while(treeWalker.nextNode()) allNodes.push(treeWalker.currentNode);

  let
    position = -1,
    currentNodeIdx = 0
  ;

  for(const node of allNodes) {
    if(node.nodeType === Node.TEXT_NODE) {
      nodeContents.set(node, node.textContent);

      node.textContent = node.textContent.slice(0, Math.max(0, prevPosition - position + 1));

      position += nodeContents.get(node).length;
    } else if(node instanceof Element && position > prevPosition) {
      node.classList.add(styles.hidden);
    }

    if(position <= prevPosition) {
      currentNodeIdx++;
    }
  }

  return {maxPosition: position, nodeContents, allNodes, currentNodeIdx};
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
  setLastTextNode: (node: Node) => void;
  onEnd: () => void;
  nodeContents: WeakMap<Node, string>;
  length: number;
};

function typeNext({result, setLastTextNode, onEnd, nodeContents, length}: TypeNextArgs) {
  const {allNodes, clean} = result;

  while(result.currentNodeIdx < allNodes.length && length) {
    const node = allNodes[result.currentNodeIdx];

    if(node instanceof Element) {
      result.currentNodeIdx++;
      node.classList.remove(styles.hidden);
    } else if(node.nodeType === Node.TEXT_NODE) {
      const typedLength = node.textContent.length;
      const finalContent = nodeContents.get(node);

      const leftOverLength = Math.max(0, typedLength + length - finalContent.length);

      const start = typedLength;
      const end = start + length - leftOverLength;

      node.textContent += finalContent.slice(start, end);

      length = leftOverLength;
      result.currentPosition += end - start;

      if(leftOverLength) result.currentNodeIdx++;
      setLastTextNode(node);
    }
  }

  if(result.currentNodeIdx >= allNodes.length) {
    clean();
    onEnd();
  }
}


const BASE_DELAY = 60 * 1_000 / (800 * 5); // 800wpm
const MIN_DELAY = 60 * 1_000 / (2_400 * 5); // 2_400wpm
const DELAY_VARIATION = 0.3;

// Try to write it with the base speed of 800wpm or burst it in 5 seconds if it's a long message, maximum speed of 2_400wpm overall
function getRandomDelay(targetDelay: number) {
  const delay = Math.max(MIN_DELAY, Math.min(BASE_DELAY, targetDelay));
  return delay + Math.random() * delay * DELAY_VARIATION;
}


type RunAnimationArgs = {
  scrollable: HTMLElement;
  typeNext: (length: number) => void;
  isCleaned: () => boolean;
  maxPosition: number;
  prevPosition: number;
};

const TARGET_TIME_TO_WRITE = 5000;

function runAnimation({scrollable, typeNext, isCleaned, maxPosition, prevPosition}: RunAnimationArgs) {
  const targetDelay = TARGET_TIME_TO_WRITE / (maxPosition - prevPosition);

  let prevTime = 0;

  const animationInvalidation = registerAnimationInvalidation(scrollable);

  const checkCleaned = () => {
    if(!isCleaned()) return false;

    animationInvalidation.cleanup();

    return true;
  };

  let skip = -1;
  const skipFrames = 2;

  animate(() => {
    if(checkCleaned()) return false;

    skip = (skip + 1) % skipFrames;
    if(skip) return true;

    const now = performance.now();
    if(!prevTime) prevTime = now;

    const length = Math.max(0, Math.round((now - prevTime) / getRandomDelay(targetDelay)));

    if(length) {
      typeNext(length);
      prevTime = now;
    }

    if(length && !animationInvalidation.isInvalidated()) {
      // value.aboutToScroll = true;

      // animate(() => {
      // value.aboutToScroll = false;
      // if(value.invalidateTimeoutId || checkCleaned()) return;

      const threshold = 120; // px
      if(scrollable.scrollTop + scrollable.clientHeight > scrollable.scrollHeight - threshold) {
        scrollable.scrollTop = scrollable.scrollHeight;
      }
      // });
    }

    return true;
  });
}


type RegisteredScrollableValue = {
  count: number;
  invalidateTimeoutId?: number;
  // aboutToScroll?: boolean;
  cleanup: () => void;
};

const INVALIDATE_SCROLL_TIMEOUT = 450;

const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
const registeredScrollables = new Map<HTMLElement, RegisteredScrollableValue>();

function registerAnimationInvalidation(scrollable: HTMLElement) {
  let value: RegisteredScrollableValue;

  if(!registeredScrollables.has(scrollable)) {
    value = {
      count: 0,
      cleanup: () => {
        events.forEach(event => {
          scrollable.removeEventListener(event, callback);
        });
      }
    };

    const callback = () => {
      if(value.invalidateTimeoutId) self.clearTimeout(value.invalidateTimeoutId);
      value.invalidateTimeoutId = self.setTimeout(() => {
        value.invalidateTimeoutId = undefined;
      }, INVALIDATE_SCROLL_TIMEOUT)
    };

    events.forEach(event => {
      scrollable.addEventListener(event, callback, {passive: true});
    });

    registeredScrollables.set(scrollable, value);
  } else {
    value = registeredScrollables.get(scrollable);
  }

  value.count++;

  let cleaned = false;

  return {
    isInvalidated: () => !!value.invalidateTimeoutId,
    cleanup: () => {
      if(cleaned) return;
      cleaned = true;

      value.count--;

      if(value.count <= 0) {
        value.cleanup();
        registeredScrollables.delete(scrollable);
      }
    }
  };
}
