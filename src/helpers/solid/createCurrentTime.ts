import {createSignal, onCleanup} from 'solid-js'
import tsNow from '../tsNow'

export function createCurrentTime(options: {
  fn?: () => number
  updateInterval?: number
} = {}) {
  const {fn = tsNow, updateInterval = 30000} = options

  const [time, setTime] = createSignal(fn())
  const interval = setInterval(() => {
    setTime(fn())
  }, updateInterval)

  onCleanup(() => clearInterval(interval))

  return time
}
