import liteMode from '../liteMode';

export default function shake(element: HTMLElement) {
  if(!liteMode.isAvailable('animations')) {
    return;
  }

  const keyframes: Keyframe[] = [
    {transform: 'translateX(0)'},
    {transform: 'translateX(.25rem)'},
    {transform: 'translateX(-.25rem)'},
    {transform: 'translateX(0)'}
  ];

  element.animate([...keyframes, ...keyframes, ...keyframes], {
    duration: 300,
    iterations: 1,
    easing: 'ease-in-out'
  });
}
