import formatDuration from '@helpers/formatDuration';
import toHHMMSS from '@helpers/string/toHHMMSS';
import {Accessor, createEffect, createMemo, createSignal, JSX, onCleanup} from 'solid-js';
import {wrapFormattedDuration} from './wrappers/wrapDuration';


const hourInSeconds = 60 * 60;
const minuteInSeconds = 60;
const updateTimerFrom = hourInSeconds + minuteInSeconds;

type Props = {
  finishTimestamp: number;
  children: (time: Accessor<JSX.Element>) => JSX.Element;
};

export const RemainingTime = (props: Props) => {
  const [shouldUpdateTimer, setShouldUpdateTimer] = createSignal(false);

  const nowMillis = useNowMillis(shouldUpdateTimer);
  const nowSeconds = createMemo(() => Math.floor(nowMillis() / 1000));

  const finishesAtSeconds = createMemo(() => props.finishTimestamp);
  const remainingSeconds = createMemo(() => Math.max(0, finishesAtSeconds() - nowSeconds()) || 0);

  createEffect(() => {
    setShouldUpdateTimer(0 < remainingSeconds() && remainingSeconds() < updateTimerFrom);
  });

  const formattedTime = createMemo(() => {
    if(remainingSeconds() < hourInSeconds) {
      return toHHMMSS(remainingSeconds());
    }
    return wrapFormattedDuration(formatDuration(remainingSeconds(), 1))
  });

  return props.children(formattedTime);
};

function useNowMillis(shouldUpdate: Accessor<boolean>) {
  const [now, setNow] = createSignal(Date.now());

  createEffect(() => {
    if(!shouldUpdate()) {
      return;
    }

    let timeout: number;

    function scheduleNext() {
      const now = Date.now();
      const msPart = now % 1000;
      const left = 1000 - msPart;

      setNow(now);
      timeout = self.setTimeout(scheduleNext, left);
    }

    scheduleNext();

    onCleanup(() => {
      self.clearTimeout(timeout);
    });
  });

  return now;
}
