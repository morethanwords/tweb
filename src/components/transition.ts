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
}

const Transition = (content: HTMLElement, type: 'tabs' | 'navigation' | 'zoom-fade', transitionTime: number, onTransitionEnd?: (id: number) => void) => {
  const hideTimeouts: {[id: number]: number} = {};
  //const deferred: (() => void)[] = [];
  let transitionEndTimeout: number;
  let prevTabContent: HTMLElement = null;

  const animationFunction = type == 'zoom-fade' ? null : (type == 'tabs' ? slideTabs : slideNavigation);

  function selectTab(id: number, animate = true) {
    const self = selectTab;
    if(id == self.prevId) return false;

    //console.log('selectTab id:', id);

    const p = prevTabContent;
    const tabContent = content.children[id] as HTMLElement;

    // * means animation isn't needed
    if(content.dataset.slider == 'none' || !animate) {
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

    if(!tabContent) {
      //prevTabContent.classList.remove('active');
    } else if(self.prevId != -1) {
      if(animationFunction) {
        animationFunction(tabContent, prevTabContent, toRight);
      }

      tabContent.classList.add('to');
    } else {
      tabContent.classList.add('active');
    }
    
    const _prevId = self.prevId;
    if(hideTimeouts.hasOwnProperty(id)) clearTimeout(hideTimeouts[id]);
    if(p/*  && false */) {
      hideTimeouts[_prevId] = window.setTimeout(() => {
        p.style.transform = p.style.filter = '';
        p.classList.remove('active', 'from');

        content.classList.remove('animating', 'backwards');

        if(tabContent) {
          tabContent.classList.remove('to');
          tabContent.classList.add('active');
        }

        delete hideTimeouts[_prevId];
      }, transitionTime);

      if(onTransitionEnd) {
        if(transitionEndTimeout) clearTimeout(transitionEndTimeout);
        transitionEndTimeout = window.setTimeout(() => {
          onTransitionEnd(self.prevId);
          transitionEndTimeout = 0;
        }, transitionTime);
      }
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