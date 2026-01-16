import {createRoot, JSX} from 'solid-js';
import {Middleware} from '../middleware';

export function wrapSolidComponent(component: () => JSX.Element, middleware: Middleware): HTMLElement {
  let dispose!: VoidFunction
  let el = createRoot((dispose_) => {
    dispose = dispose_
    return component()
  })

  if(typeof el === 'function') {
    el = (el as () => HTMLElement)()
  }

  middleware.onClean(dispose)

  return el as HTMLElement
}
