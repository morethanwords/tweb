import {IconTsx} from '@components/iconTsx';
import {openPollLinkPreviewPopup} from '@components/popups/pollLink';
import PhotoTsx from '@components/wrappers/photoTsx';
import classNames from '@helpers/string/classNames';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {Show} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {usePollMessageContentProps} from './context';
import styles from './styles.module.scss';
import {GetWebPageMediaResult} from './usePollDerivedProps';


const boxSize = 32;

export const PollWebPageMedia = (props: {
  webPage: GetWebPageMediaResult;
  class?: string;
  compact?: boolean;
}) => {
  const {HotReloadGuard} = useHotReloadGuard();
  const contextProps = usePollMessageContentProps();

  const openPreview = (trigger: HTMLElement) => {
    if(!props.webPage.url) return;

    openPollLinkPreviewPopup({
      url: props.webPage.url,
      preview: props.webPage.media,
      message: contextProps.message,
      onClose: () => {
        if(trigger.isConnected) trigger.focus();
      }
    }, HotReloadGuard);
  };

  const handleClick = (event: MouseEvent) => {
    if(!clickable()) return;

    event.preventDefault();
    event.stopPropagation();
    const trigger = event.currentTarget as HTMLElement;
    trigger.focus();
    openPreview(trigger);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if(event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    event.stopPropagation();
    openPreview(event.currentTarget as HTMLElement);
  };

  const compact = () => props.compact !== false;
  const clickable = () => !!props.webPage.url;

  return (
    <div
      class={classNames(styles.pollOptionMedia, styles.stripped, styles.pollWebPageMedia, props.class)}
      classList={{
        [styles.clickable]: clickable(),
        [styles.pollOptionMediaWebPage]: true,
        [styles.withPhoto]: !!props.webPage.photo
      }}
      role={clickable() ? 'button' : undefined}
      tabIndex={clickable() ? 0 : undefined}
      aria-label={clickable() ? props.webPage.url : undefined}
      on:click={handleClick}
      on:keydown={handleKeyDown}
    >
      <Show when={props.webPage.photo} keyed>
        {(photo) => (
          <PhotoTsx
            class={styles.pollOptionMediaLinkPhoto}
            photo={photo}
            boxWidth={compact() ? boxSize : undefined}
            boxHeight={compact() ? boxSize : undefined}
            loadPromises={unwrap(contextProps.loadPromises)}
            autoDownloadSize={contextProps.autoDownload?.photo}
            withoutPreloader
          />
        )}
      </Show>
      <Show when={props.webPage.photo}>
        <div class={styles.pollOptionMediaLinkOverlay} />
      </Show>
      <IconTsx icon='link' class={styles.pollOptionMediaLinkIcon} />
    </div>
  );
};
