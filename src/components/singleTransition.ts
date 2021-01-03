import rootScope from "../lib/rootScope";

const SetTransition = (element: HTMLElement, className: string, forwards: boolean, duration: number, onTransitionEnd?: () => void) => {
  const timeout = element.dataset.timeout;
  if(timeout !== undefined) {
    clearTimeout(+timeout);
  }

  if(forwards) {
    element.classList.add(className);
  }

  const afterTimeout = () => {
    delete element.dataset.timeout;
    if(!forwards) {
      element.classList.remove('backwards', className);
    }

    element.classList.remove('animating');
    
    onTransitionEnd && onTransitionEnd();
  };

  if(!rootScope.settings.animationsEnabled) {
    element.classList.remove('animating', 'backwards');
    afterTimeout();
    return;
  }

  element.classList.add('animating');

  element.classList.toggle('backwards', !forwards);
  element.dataset.timeout = '' + setTimeout(afterTimeout, duration);
};

export default SetTransition;