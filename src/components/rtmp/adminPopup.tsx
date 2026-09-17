import PopupElement, {createPopup} from '@components/popups/indexTsx';
import rootScope from '@lib/rootScope';

import '@components/rtmp/adminPopup.css';
import {Show, createSignal} from 'solid-js';
import {toastNew} from '@components/toast';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {Ripple} from '@components/rippleTsx';
import {RtmpData} from '@components/rtmp/rtmpData';
import {i18n} from '@lib/langPack';
import appImManager from '@lib/appImManager';

const cnPopup = (className = '') => `rtmp-popup${className}`;

export interface RtmpAdminPopupProps {
  peerId: PeerId
  active?: boolean
  onEndStream?: () => void
}

export function showRtmpStartStreamPopup(props: RtmpAdminPopupProps) {
  const [show, setShow] = createSignal(true);
  const managers = rootScope.managers;
  const {active} = props;

  createPopup(() => {
    const [url, setUrl] = createSignal('');
    const [key, setKey] = createSignal('');
    const [loading, setLoading] = createSignal(true);

    const fetchData = (revoke = false) => {
      managers.appGroupCallsManager.fetchRtmpUrl(props.peerId, revoke).then(({url, key}) => {
        setUrl(url);
        setKey(key);
        setLoading(false);
      }).catch(() => {
        toastNew({
          langPackKey: 'Error.AnError'
        });
        setShow(false);
      });
    };

    const revokeKey = () => {
      setLoading(true);
      fetchData(true);
    };

    const onStreamStart = () => {
      setShow(false);
      if(active) {
        props.onEndStream();
        return;
      }

      const peerId = props.peerId;
      managers.appGroupCallsManager.createGroupCall(
        peerId.toChatId(),
        undefined,
        undefined,
        true
      ).then(() => {
        appImManager.joinLiveStream(peerId);
      });
    };

    fetchData();

    return (
      <PopupElement class={cnPopup()} closable show={show()}>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title>
            {active ? i18n('Rtmp.StreamPopup.TitleSettings') : i18n('Rtmp.StreamPopup.Title')}
          </PopupElement.Title>
          <Show when={!active}>
            {ButtonMenuToggle({
              buttons: [{
                icon: 'stop',
                regularText: 'Revoke',
                danger: true,
                onClick: () => revokeKey()
              }],
              direction: 'bottom-left'
            })}
          </Show>
        </PopupElement.Header>
        <PopupElement.Body>
          <RtmpStartStreamPopupContent
            url={url()}
            key={key()}
            loading={loading()}
            active={Boolean(active)}
            onStreamStart={onStreamStart}
            onRevoked={revokeKey}
          />
        </PopupElement.Body>
      </PopupElement>
    );
  });
}

interface RtmpPopupProps {
  url: string;
  key: string;
  loading: boolean;
  active: boolean;
  onStreamStart: () => void;
  onRevoked: () => void;
}

const RtmpStartStreamPopupContent = (props: RtmpPopupProps) => {
  return (
    <div class={cnPopup('-content')}>
      <div class={cnPopup('-text')}>
        {i18n('Rtmp.StreamPopup.Description')}
      </div>

      <RtmpData
        key={props.key}
        url={props.url}
        loading={props.loading}
        showRevoke={props.active}
        onRevoke={props.onRevoked}
      />

      <Show when={!props.active}>
        <div class={cnPopup('-text')}>
          {i18n('Rtmp.StreamPopup.Hint')}
        </div>
      </Show>

      <Ripple>
        <button onClick={props.onStreamStart}
          classList={{
            [cnPopup('-button')]: true,
            [cnPopup('-button_danger')]: props.active
          }}
        >
          {props.active ? i18n('Rtmp.StreamPopup.EndLiveStream') : i18n('Rtmp.StreamPopup.StartStreaming')}
        </button>
      </Ripple>
    </div>
  );
};
