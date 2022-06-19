var chatInner = appImManager.chat.bubbles.chatInner;
var dateGroup = chatInner.firstElementChild;
var topBubble = chatInner.querySelector('[data-mid="6318129151"]').parentElement;
var bottomBubble = chatInner.querySelector('[data-mid="6318587903"]').parentElement;
topBubble.remove();
bottomBubble.remove();
var f = () => {
    var scrollSaver = appImManager.chat.bubbles.createScrollSaver();
    scrollSaver.save();
    
    dateGroup.prepend(topBubble);
    dateGroup.append(bottomBubble);
    scrollSaver.restore();
};
// f();
setTimeout(() => f(), 1000);