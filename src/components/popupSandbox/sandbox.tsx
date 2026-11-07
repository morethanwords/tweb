import {Show} from 'solid-js';
import classNames from '@helpers/string/classNames';
import SandboxPanel, {createStoryList, SandboxLog} from './panel';
import {getStories, PopupStory} from './registry';
import {createCheckedStories} from './checkedStories';
import styles from './sandbox.module.scss';

const checked = createCheckedStories('popup-sandbox-checked');

export type SandboxProps = {
  onOpen: (story: PopupStory) => void,
  /** Set only when the sandbox is an overlay over a running app — closing it restores the app. */
  onClose?: () => void,
  activeId: () => string,
  unhandled: () => string[],
  /** Whether this session has real data to offer. */
  canGoLive: boolean,
  /** Only the standalone sandbox owns the theme (see SandboxPanel). */
  canSetTheme: boolean,
  dataSource: () => 'fixtures' | 'live',
  setDataSource: (source: 'fixtures' | 'live') => void,
  /** Peer kinds the account has none of; those stories fall back to fixtures. */
  liveGaps: () => string[],
  /** The open story had fixture manager answers that live mode does not apply. */
  droppedOverrides: () => boolean,
  allowWrites: () => boolean,
  setAllowWrites: (value: boolean) => void
};

export default function PopupSandboxPanel(props: SandboxProps) {
  const list = createStoryList(getStories, checked);

  return (
    <SandboxPanel
      title="Popup sandbox"
      searchPlaceholder="Filter popups…"
      list={list}
      checked={checked}
      onOpen={props.onOpen}
      activeId={props.activeId}
      onClose={props.onClose}
      canSetTheme={props.canSetTheme}
      itemNote={(story) => (
        <Show when={props.dataSource() === 'live' && story.fixtureOnly}>
          {' · fixtures'}
        </Show>
      )}
      footer={
        <SandboxLog title="Unanswered manager calls" entries={props.unhandled}>
          {(call) => call}
        </SandboxLog>
      }
    >
      <Show when={props.canGoLive}>
        <div class={styles.Source}>
          <label>
            <input
              type="radio"
              name="popup-sandbox-source"
              checked={props.dataSource() === 'fixtures'}
              onChange={() => props.setDataSource('fixtures')}
            />
            Fixtures
          </label>
          <label>
            <input
              type="radio"
              name="popup-sandbox-source"
              checked={props.dataSource() === 'live'}
              onChange={() => props.setDataSource('live')}
            />
            My data
          </label>
        </div>
      </Show>

      <Show when={props.dataSource() === 'live'}>
        <label class={classNames(styles.Notice, props.allowWrites() && styles.Danger)}>
          <input
            type="checkbox"
            checked={props.allowWrites()}
            onChange={(e) => props.setAllowWrites(e.currentTarget.checked)}
          />
          {' '}Let popups write
          <div>
            {props.allowWrites() ?
              'Confirm buttons do the real thing — delete, leave, pay. There is no undo.' :
              'Reads only. Confirm buttons resolve to nothing and are listed below.'}
          </div>
          <Show when={props.liveGaps().length}>
            <div>No {props.liveGaps().join(', ')} in this account — those stories use fixtures.</div>
          </Show>
          <Show when={props.droppedOverrides()}>
            <div>This story's canned manager answers are not applied here — it reads the real ones.</div>
          </Show>
        </label>
      </Show>

      <Show when={props.onClose && props.dataSource() === 'fixtures'}>
        <div class={styles.Notice}>
          The popup layer is on mock data while this is open. Close it to give the app its managers back.
        </div>
      </Show>
    </SandboxPanel>
  );
}
