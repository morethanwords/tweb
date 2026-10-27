import ChatBackgroundGradientRenderer from '@components/chat/gradientRenderer';

const CSS_VAR = '--message-out-gradient-image';
const POS_VAR = '--out-grad-pos';
const SIZE_VAR = '--out-grad-size';
const HOST_CLASS = 'has-outgoing-message-gradient';

const SELECTOR = [
  '.bubble.is-out .bubble-content',
  '.bubble.is-out .bubble-content-background',
  '.bubble.is-out .bubble-tail',
  '.bubble.is-out.photo .attachment',
  '.bubble.is-out.video .attachment',
  // dog ear
  '.bubble.is-out .document-ico'
].join(',');

let liveRenderer: ChatBackgroundGradientRenderer | undefined;
let liveCanvas: HTMLCanvasElement | undefined;
let liveAnimated = false;

const activeHosts = new Set<HTMLElement>();

function setCssImage(host: HTMLElement, value: string | undefined) {
  if(value) {
    host.style.setProperty(CSS_VAR, value);
    host.classList.add(HOST_CLASS);
    activeHosts.add(host);
  } else {
    host.style.removeProperty(CSS_VAR);
    host.classList.remove(HOST_CLASS);
    activeHosts.delete(host);
  }
}

function pushCanvasToCss() {
  if(!liveCanvas) return;
  const url = `url(${liveCanvas.toDataURL()})`;
  for(const host of activeHosts) {
    if(!host.isConnected) continue;
    host.style.setProperty(CSS_VAR, url);
  }
}

function destroyLive() {
  liveRenderer?.cleanup();
  liveRenderer = undefined;
  liveCanvas = undefined;
  liveAnimated = false;
}

function clearElementGradientStyles(el: HTMLElement) {
  el.style.removeProperty(POS_VAR);
  el.style.removeProperty(SIZE_VAR);
  el.style.removeProperty('background-size');
  el.style.removeProperty('background-position');
}

function hasSharedGradient() {
  for(const host of activeHosts) {
    if(!host.isConnected) continue;
    const v = host.style.getPropertyValue(CSS_VAR).trim();
    if(v && v !== 'none') return true;
  }
  const v = document.documentElement.style.getPropertyValue(CSS_VAR).trim();
  return !!v && v !== 'none';
}

export function syncOutgoingMessageGradient(root: ParentNode = document) {
  const enabled = hasSharedGradient();
  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const size = `${vw}px ${vh}px`;

  root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
    if(!enabled) {
      clearElementGradientStyles(el);
      return;
    }

    const rect = el.getBoundingClientRect();

    if(rect.bottom < -64 || rect.top > vh + 64) return;

    // thumb files have no dog ear
    if(el.classList.contains('document-ico') && el.closest('.document-with-thumb')) {
      clearElementGradientStyles(el);
      return;
    }

    let left = rect.left;
    let top = rect.top;
    if(el.classList.contains('document-ico')) {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const half = (1.125 * rem) / 2;
      left = rect.right - half;
      top = rect.top - half;
    }
    const pos = `${-left}px ${-top}px`;
    // Custom props
    el.style.setProperty(SIZE_VAR, size);
    el.style.setProperty(POS_VAR, pos);

    if(
      el.classList.contains('bubble-content') ||
      el.classList.contains('bubble-content-background') ||
      el.classList.contains('bubble-tail')
    ) {
      el.style.backgroundSize = size;
      el.style.backgroundPosition = pos;
    }
  });
}

export function getOutgoingMessageGradientImage(): string | undefined {
  for(const host of activeHosts) {
    if(!host.isConnected) continue;
    const v = host.style.getPropertyValue(CSS_VAR).trim();
    if(v && v !== 'none') return v;
  }
  const v = document.documentElement.style.getPropertyValue(CSS_VAR).trim();
  return v && v !== 'none' ? v : undefined;
}

export function paintViewportOutgoingGradient(
  el: HTMLElement,
  pageLeft: number,
  pageTop: number,
  image = getOutgoingMessageGradientImage()
) {
  if(!image) return false;
  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  el.style.backgroundImage = image;
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundSize = `${vw}px ${vh}px`;
  el.style.backgroundPosition = `${-pageLeft}px ${-pageTop}px`;
  el.style.backgroundColor = 'transparent';
  return true;
}

export function createOutgoingMessageGradientSync(getRoot: () => ParentNode | null | undefined) {
  let raf = 0;

  const schedule = () => {
    if(raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const root = getRoot();
      if(root) syncOutgoingMessageGradient(root);
    });
  };

  return {
    schedule,
    syncNow: () => {
      const root = getRoot();
      if(root) syncOutgoingMessageGradient(root);
    },
    destroy: () => {
      if(raf) cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}

export type OutgoingMessageGradientOptions = {
  hexColors: string[],
  animated?: boolean,
  element?: HTMLElement
};

export function paintThemeOutBubble(
  bubble: HTMLElement | null | undefined,
  options: {hexColors: string[], animated?: boolean, host?: HTMLElement | null}
) {
  if(!bubble) return;

  const colors = options.hexColors.filter(Boolean);
  if(!colors.length) {
    bubble.style.removeProperty('background-image');
    bubble.style.removeProperty('background-color');
    return;
  }

  const solid = colors.length === 1 || (colors.length === 2 && colors[0] === colors[1]);
  // Freeform only message_colors_animated is true
  const useFreeform = !!options.animated && !solid;

  if(solid) {
    bubble.style.backgroundImage = 'none';
    bubble.style.backgroundColor = colors[0];
    return;
  }

  if(useFreeform) {
    let image = options.host?.style.getPropertyValue(CSS_VAR).trim();
    if(!image || image === 'none') {
      try {
        const {gradientRenderer, canvas} = ChatBackgroundGradientRenderer.create(colors.join(','));
        image = `url(${canvas.toDataURL()})`;
        gradientRenderer.cleanup();
      } catch(e) {
        image = '';
      }
    }
    if(image) {
      bubble.style.backgroundImage = image;
    } else {
      bubble.style.removeProperty('background-image');
    }
    bubble.style.backgroundColor = colors[0];
    bubble.style.backgroundSize = '100% 100%';
    bubble.style.backgroundPosition = 'center';
    bubble.style.backgroundRepeat = 'no-repeat';
    return;
  }

  // Apply vertical gradient from bottom to top vertically like on tga
  const stops = colors.slice().reverse();
  bubble.style.backgroundImage = `linear-gradient(180deg, ${stops.join(', ')})`;
  bubble.style.backgroundColor = colors[0];
  bubble.style.backgroundSize = '100% 100%';
  bubble.style.backgroundPosition = 'center';
  bubble.style.backgroundRepeat = 'no-repeat';
}

function syncRootFor(host: HTMLElement) {
  return host === document.documentElement ? document : host;
}

function isLiveHost(host: HTMLElement) {
  return host === document.documentElement || host.classList.contains('chat');
}

export function setOutgoingMessageGradient(options: OutgoingMessageGradientOptions) {
  const host = options.element ?? document.documentElement;
  const live = isLiveHost(host);

  if(live) {
    destroyLive();
  }

  const colors = options.hexColors.filter(Boolean);
  if(!colors.length) {
    setCssImage(host, undefined);
    if(host === document.documentElement || host.isConnected) {
      syncOutgoingMessageGradient(syncRootFor(host));
    }
    return;
  }

  const solid = colors.length === 1 || (colors.length === 2 && colors[0] === colors[1]);
  if(solid) {
    setCssImage(host, undefined);
    syncOutgoingMessageGradient(syncRootFor(host));
    return;
  }

  // message_colors_animated otherwise use
  // vertical gradient not freeform
  const useFreeform = !!options.animated;

  if(!useFreeform) {
    const stops = colors.slice().reverse();
    setCssImage(host, `linear-gradient(180deg, ${stops.join(', ')})`);
    syncOutgoingMessageGradient(syncRootFor(host));
    return;
  }

  const {gradientRenderer, canvas} = ChatBackgroundGradientRenderer.create(colors.join(','));
  const url = `url(${canvas.toDataURL()})`;
  if(live) {
    liveRenderer = gradientRenderer;
    liveCanvas = canvas;
    liveAnimated = true;
    setCssImage(host, url);
  } else {
    setCssImage(host, url);
    gradientRenderer.cleanup();
  }

  syncOutgoingMessageGradient(syncRootFor(host));
}

export function isOutgoingMessageGradientAnimated() {
  return liveAnimated && !!liveRenderer;
}

export function animateOutgoingMessageGradient(getProgress: () => number) {
  if(!liveRenderer || !liveAnimated) return;
  liveRenderer.toNextPosition(() => {
    const progress = getProgress();
    requestAnimationFrame(() => {
      pushCanvasToCss();
      syncOutgoingMessageGradient();
    });
    return progress;
  });
}
