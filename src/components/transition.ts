function slideNavigation(tabContent: HTMLElement, prevTabContent: HTMLElement, toRight: boolean) {
  const width = prevTabContent.getBoundingClientRect().width;
  const elements = [tabContent, prevTabContent];
  if(toRight) elements.reverse();
  elements[0].style.filter = `brightness(80%)`;
  elements[0].style.transform = `translate3d(${-width * .25}px, 0, 0)`;
  elements[1].style.transform = `translate3d(${width}px, 0, 0)`;
  
  tabContent.classList.add('active');
  void tabContent.offsetWidth; // reflow

  tabContent.style.transform = '';
  tabContent.style.filter = '';

  return () => {
    prevTabContent.style.transform = prevTabContent.style.filter = '';
  };
}

function slideTabs(tabContent: HTMLElement, prevTabContent: HTMLElement, toRight: boolean) {
  const width = prevTabContent.getBoundingClientRect().width;
  const elements = [tabContent, prevTabContent];
  if(toRight) elements.reverse();
  elements[0].style.transform = `translate3d(${-width}px, 0, 0)`;
  elements[1].style.transform = `translate3d(${width}px, 0, 0)`;

  tabContent.classList.add('active');
  void tabContent.offsetWidth; // reflow

  tabContent.style.transform = '';

  return () => {
    prevTabContent.style.transform = '';
  };
}

/* function slideTabsVertical(tabContent: HTMLElement, prevTabContent: HTMLElement, toRight: boolean) {
  const height = prevTabContent.getBoundingClientRect().height;
  const elements = [tabContent, prevTabContent];
  if(toRight) elements.reverse();
  elements[0].style.transform = `translate3d(0, ${-height}px, 0)`;
  elements[1].style.transform = `translate3d(0, ${height}px, 0)`;

  tabContent.classList.add('active');
  void tabContent.offsetWidth; // reflow

  tabContent.style.transform = '';

  return () => {
    prevTabContent.style.transform = '';
  };
} */

export const TransitionSlider = (content: HTMLElement, type: 'tabs' | 'navigation' | 'zoom-fade'/*  | 'counter' */, transitionTime: number, onTransitionEnd?: (id: number) => void) => {
  let animationFunction: TransitionFunction = null;

  switch(type) {
    case 'tabs':
      animationFunction = slideTabs;
      break;
    case 'navigation':
      animationFunction = slideNavigation;
      break;
    /* case 'counter':
      animationFunction = slideTabsVertical;
      break; */
    /* default:
      break; */
  }
  
  return Transition(content, animationFunction, transitionTime, onTransitionEnd);
};

type TransitionFunction = (tabContent: HTMLElement, prevTabContent: HTMLElement, toRight: boolean) => void | (() => void);

const Transition = (content: HTMLElement, animationFunction: TransitionFunction, transitionTime: number, onTransitionEnd?: (id: number) => void) => {
  const hideTimeouts: {[id: number]: number} = {};
  //const deferred: (() => void)[] = [];
  let transitionEndTimeout: number;
  let prevTabContent: HTMLElement = null;

  function selectTab(id: number, animate = true) {
    const self = selectTab;
    if(id == self.prevId) return false;

    //console.log('selectTab id:', id);

    const p = prevTabContent;
    const tabContent = content.children[id] as HTMLElement;

    // * means animation isn't needed
    if(/* content.dataset.slider == 'none' ||  */!animate) {
      if(p) {
        p.classList.remove('active');  
      }

      tabContent.classList.add('active');

      self.prevId = id;
      prevTabContent = tabContent;

      if(onTransitionEnd) onTransitionEnd(self.prevId);
      return;
    }

    if(prevTabContent) {
      prevTabContent.classList.remove('to');
      prevTabContent.classList.add('from');
    }

    content.classList.add('animating');
    const toRight = self.prevId < id;
    content.classList.toggle('backwards', !toRight);

    let afterTimeout: ReturnType<TransitionFunction>;
    if(!tabContent) {
      //prevTabContent.classList.remove('active');
    } else if(self.prevId != -1) {
      if(animationFunction) {
        afterTimeout = animationFunction(tabContent, prevTabContent, toRight);
      }

      tabContent.classList.add('to');
    } else {
      tabContent.classList.add('active');
    }
    
    const _prevId = self.prevId;
    if(hideTimeouts.hasOwnProperty(id)) clearTimeout(hideTimeouts[id]);
    if(p/*  && false */) {
      hideTimeouts[_prevId] = window.setTimeout(() => {
        if(afterTimeout) {
          afterTimeout();
        }

        p.classList.remove('active', 'from');

        if(tabContent) {
          tabContent.classList.remove('to');
          tabContent.classList.add('active');
        }

        delete hideTimeouts[_prevId];
      }, transitionTime);

      if(transitionEndTimeout) clearTimeout(transitionEndTimeout);
      transitionEndTimeout = window.setTimeout(() => {
        if(onTransitionEnd) {
          onTransitionEnd(self.prevId);
        }

        content.classList.remove('animating', 'backwards');

        transitionEndTimeout = 0;
      }, transitionTime);
    }
    
    self.prevId = id;
    prevTabContent = tabContent;

    /* if(p) {
      return new Promise((resolve) => {
        deferred.push(resolve);
      });
    } else {
      return Promise.resolve();
    } */
  }

  selectTab.prevId = -1;
  
  return selectTab;
};

export default Transition;