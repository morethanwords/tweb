{
  const chatInner = appImManager.chat.bubbles.chatInner;
  const dateGroup = chatInner.firstElementChild;
  const topBubble = chatInner.querySelector('[data-mid="6318129151"]').parentElement;
  const bottomBubble = chatInner.querySelector('[data-mid="6318587903"]').parentElement;
  topBubble.remove();
  bottomBubble.remove();
  const f = () => {
    const scrollSaver = appImManager.chat.bubbles.createScrollSaver();
    scrollSaver.save();

    dateGroup.prepend(topBubble);
    dateGroup.append(bottomBubble);
    scrollSaver.restore();
  };
  // f();
  setTimeout(() => f(), 1000);
}
