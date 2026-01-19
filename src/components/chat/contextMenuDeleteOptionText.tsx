import {Accessor, createEffect, createMemo, createSignal, onCleanup, Show} from 'solid-js';
import formatDuration from '../../helpers/formatDuration';
import {attachHotClassName} from '../../helpers/solid/classname';
import {I18nTsx} from '../../helpers/solid/i18n';
import toHHMMSS from '../../helpers/string/toHHMMSS';
import defineSolidElement, {PassedProps} from '../../lib/solidjs/defineSolidElement';
import {IconTsx} from '../iconTsx';
import {wrapFormattedDuration} from '../wrappers/wrapDuration';
import styles from './contextMenuDeleteOptionText.module.scss';

if(import.meta.hot) import.meta.hot.accept();


type Props = {
  dateTimestamp: number;
  ttlPeriod?: number;
};

export const ContextMenuDeleteOptionText = defineSolidElement({
  name: 'context-menu-delete-option-text',
  component: (props: PassedProps<Props>) => {
    attachHotClassName(props.element, styles.Container);

    // Uncomment these lines to manually test different scenarios
    // props.dateTimestamp = Date.now() / 1000
    // props.ttlPeriod = 60 * 60 + 4

    return (
      <Show when={props.ttlPeriod} fallback={<I18nTsx key='Delete' />}>
        <div>
          <I18nTsx key='Delete' />
        </div>
        <div class={styles.Subtitle}>
          <IconTsx class={styles.Icon} icon='fire' />
          <AutoDeletesIn dateTimestamp={props.dateTimestamp} ttlPeriod={props.ttlPeriod} />
        </div>
      </Show>
    );
  }
});

const hourInSeconds = 60 * 60;
const minuteInSeconds = 60;
const updateTimerFrom = hourInSeconds + minuteInSeconds;

const AutoDeletesIn = (props: Props) => {
  const [shouldUpdateTimer, setShouldUpdateTimer] = createSignal(false);

  const nowMillis = useNowMillis(shouldUpdateTimer);
  const nowSeconds = createMemo(() => Math.floor(nowMillis() / 1000));

  const deletesAtSeconds = createMemo(() => props.dateTimestamp + props.ttlPeriod);
  const remainingSeconds = createMemo(() => Math.max(0, deletesAtSeconds() - nowSeconds()) || 0);

  createEffect(() => {
    setShouldUpdateTimer(0 < remainingSeconds() && remainingSeconds() < updateTimerFrom);
  });

  const formattedTime = createMemo(() => {
    if(remainingSeconds() < hourInSeconds) {
      return toHHMMSS(remainingSeconds());
    }
    return wrapFormattedDuration(formatDuration(remainingSeconds(), 1))
  });

  return (
    <I18nTsx
      key='AutoDeletesIn'
      args={[formattedTime()]}
    />
  );
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
