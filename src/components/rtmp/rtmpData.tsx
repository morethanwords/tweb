import {Show, createSignal} from 'solid-js';
import '@components/rtmp/rtmpData.css';
import {IconTsx} from '@components/iconTsx';
import {Skeleton} from '@components/skeleton';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import {copyTextToClipboard} from '@helpers/clipboard';
import {toastNew} from '@components/toast';
import classNames from '@helpers/string/classNames';
import I18n, {LangPackKey, i18n} from '@lib/langPack';

export interface RtmpDataProps {
  key: string;
  url: string;
  loading: boolean;
  contrast?: boolean;
  showRevoke?: boolean;
  onRevoke?: () => void;
}

const cnRtmpData = (className = '') => `rtmp-data${className}`;

export const RtmpData = (props: RtmpDataProps) => {
  const [keyVisible, setKeyVisible] = createSignal(false);

  const keyContent = () => {
    if(keyVisible()) return props.key;
    return props.key.slice(0, 20).replace(/./g, '·');
  };
  const toggleKeyVisible = (e: MouseEvent) => {
    e.stopPropagation();
    setKeyVisible(!keyVisible());
  };

  const onCopy = (str: string, langPackKey: LangPackKey) => {
    if(props.loading) return;
    copyTextToClipboard(str);
    toastNew({
      langPackKey
    });
  };

  return (
    <div classList={{
      [cnRtmpData()]: true,
      [cnRtmpData('_contrast')]: props.contrast
    }}>
      <button
        type="button"
        disabled={props.loading}
        onClick={() => onCopy(props.url, 'Rtmp.StreamPopup.URLCopied')}
        aria-label={I18n.format('AccDescr.CopyStreamURL', true)}
        class={cnRtmpData('-row')}
      >
        <IconTsx icon="link" class={cnRtmpData('-row-icon')} />
        <div class={cnRtmpData('-row-item')}>
          <div class={cnRtmpData('-row-item-text')}>
            <Skeleton loading={props.loading}>
              {props.url}
            </Skeleton>
          </div>
          <div class={cnRtmpData('-row-item-label')}>
            {i18n('Rtmp.StreamPopup.ServerURL')}
          </div>
        </div>
        <IconTsx icon="copy" class={cnRtmpData('-row-icon')} />
      </button>

      <div
        onClick={() => onCopy(props.key, 'Rtmp.StreamPopup.KeyCopied')}
        class={cnRtmpData('-row')}
      >
        <IconTsx icon="lock" class={cnRtmpData('-row-icon')} />
        <div class={cnRtmpData('-row-item')}>
          <div aria-hidden={!keyVisible()} classList={{
            [cnRtmpData('-row-item-text')]: true,
            [cnRtmpData('-row-item-text_hidden')]: !keyVisible()
          }}>
            <Skeleton loading={props.loading}>
              {keyContent()}
            </Skeleton>
          </div>
          <div class={cnRtmpData('-row-item-label')}>
            {i18n('Rtmp.StreamPopup.StreamKey')}

            <ButtonIconTsx
              icon={keyVisible() ? 'eye2_filled' : 'eye1_filled'}
              aria-label={I18n.format('AccDescr.ShowStreamKey', true)}
              aria-pressed={keyVisible()}
              disabled={props.loading}
              onClick={toggleKeyVisible}
              class={cnRtmpData('-row-item-show')}
            />
          </div>
        </div>
        <button type="button" class={cnRtmpData('-row-copy')} disabled={props.loading} aria-label={I18n.format('AccDescr.CopyStreamKey', true)}>
          <IconTsx icon="copy" class={cnRtmpData('-row-icon')} />
        </button>
      </div>

      <Show when={props.showRevoke}>
        <button
          type="button"
          disabled={props.loading}
          onClick={props.onRevoke}
          aria-label={I18n.format('Rtmp.StreamPopup.RevokeStreamKey', true)}
          class={classNames(cnRtmpData('-row'), cnRtmpData('-row_danger'))}
        >
          <IconTsx icon="rotate_left" class={cnRtmpData('-row-icon')} />
          <div class={cnRtmpData('-row-item')}>
            <div class={cnRtmpData('-row-item-label')}>
              {i18n('Rtmp.StreamPopup.RevokeStreamKey')}
            </div>
          </div>
        </button>
      </Show>
    </div>
  );
};
