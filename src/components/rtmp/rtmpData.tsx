import {Show, createSignal} from 'solid-js';
import './rtmpData.css';
import {IconTsx} from '../iconTsx';
import {Skeleton} from '../skeleton';
import {ButtonIconTsx} from '../buttonIconTsx';
import {copyTextToClipboard} from '../../helpers/clipboard';
import {toastNew} from '../toast';
import classNames from '../../helpers/string/classNames';
import {LangPackKey, i18n} from '../../lib/langPack';

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
      <div
        onClick={() => onCopy(props.url, 'Rtmp.StreamPopup.URLCopied')}
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
      </div>

      <div
        onClick={() => onCopy(props.key, 'Rtmp.StreamPopup.KeyCopied')}
        class={cnRtmpData('-row')}
      >
        <IconTsx icon="lock" class={cnRtmpData('-row-icon')} />
        <div class={cnRtmpData('-row-item')}>
          <div classList={{
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
              icon={keyVisible() ? 'eye2' : 'eye1'}
              onClick={toggleKeyVisible}
              class={cnRtmpData('-row-item-show')}
            />
          </div>
        </div>
        <IconTsx icon="copy" class={cnRtmpData('-row-icon')} />
      </div>

      <Show when={props.showRevoke}>
        <div
          onClick={props.onRevoke}
          class={classNames(cnRtmpData('-row'), cnRtmpData('-row_danger'))}
        >
          <IconTsx icon="rotate_left" class={cnRtmpData('-row-icon')} />
          <div class={cnRtmpData('-row-item')}>
            <div class={cnRtmpData('-row-item-label')}>
              {i18n('Rtmp.StreamPopup.RevokeStreamKey')}
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
