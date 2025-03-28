import {resolveFirst} from '@solid-primitives/refs'
import {createEffect, JSX, onCleanup} from 'solid-js'

export function IntersectionObserverTsx(props: {
  onEnter?: () => void
  onLeave?: () => void
  children: JSX.Element
}) {
  const childrenEl = resolveFirst(() => props.children)
  const observer = new IntersectionObserver((entries) => {
    if(entries[0].isIntersecting) {
      props.onEnter?.()
    } else {
      props.onLeave?.()
    }
  })

  createEffect(() => {
    const child = childrenEl()
    observer.observe(child)
    onCleanup(() => observer.unobserve(child))
  })

  return <>{props.children}</>
}
