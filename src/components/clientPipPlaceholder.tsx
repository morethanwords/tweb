/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import styles from './clientPipPlaceholder.module.scss';

/**
 * Shown in the now-empty tab while the client is popped out into a Document Picture-in-Picture window,
 * so the tab doesn't read as a blank page. The button brings the client back without the user having
 * to find the PiP window's own close control.
 */
export default function ClientPipPlaceholder(props: {onReturn: () => void}) {
  return (
    <div class={styles.screen}>
      <div class={styles.content}>
        <div class={styles.title}>
          <I18nTsx key="ClientPip.PlaceholderTitle" />
        </div>
        <div class={styles.description}>
          <I18nTsx key="ClientPip.PlaceholderDescription" />
        </div>
        <button
          class={classNames('btn-primary', 'btn-color-primary', styles.button)}
          onClick={() => props.onReturn()}
        >
          <I18nTsx key="ClientPip.ReturnToTab" />
        </button>
      </div>
    </div>
  );
}
