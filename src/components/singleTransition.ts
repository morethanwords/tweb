const SetTransition = (element: HTMLElement, className: string, forwards: boolean, duration: number, onTransitionEnd?: () => void) => {
  const timeout = element.dataset.timeout;
  if(timeout !== undefined) {
    clearTimeout(+timeout);
  }

  if(forwards) {
    element.classList.add(className);
  }

  element.classList.add('animating');

  element.classList.toggle('backwards', !forwards);
  element.dataset.timeout = '' + setTimeout(() => {
    delete element.dataset.timeout;
    if(!forwards) {
      element.classList.remove('backwards', className);
    }

    element.classList.remove('animating');
    
    onTransitionEnd && onTransitionEnd();
  }, duration);
};

export default SetTransition;