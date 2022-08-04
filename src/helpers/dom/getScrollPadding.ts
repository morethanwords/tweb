export default function getScrollPadding() {
  const container = document.createElement('div');
  container.classList.add('scrollable', 'scrollable-y');
  container.style.cssText = 'width: 100px; height: 100px; position: absolute; top: -9999px;';

  const child = document.createElement('div');
  child.style.cssText = 'width: 100%; height: 110px;';

  container.append(child);
  document.body.append(container);

  const diff = container.offsetWidth - child.offsetWidth;
  container.remove();
  return diff;
}

(window as any).testBuggedScroll = getScrollPadding;
