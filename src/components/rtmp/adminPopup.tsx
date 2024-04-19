import {render} from 'solid-js/web';
import PopupElement from '../popups';

import './adminPopup.css';
import {Show, createRoot, createSignal} from 'solid-js';
import {toastNew} from '../toast';
import ButtonMenuToggle from '../buttonMenuToggle';
import {Ripple} from '../rippleTsx';
import rtmpCallsController from '../../lib/calls/rtmpCallsController';
import {RtmpData} from './rtmpData';
import {i18n} from '../../lib/langPack';

const cnPopup = (className = '') => `rtmp-popup${className}`;

export interface RtmpAdminPopupProps {
  peerId: PeerId
  active?: boolean
  onEndStream?: () => void
}

export class RtmpStartStreamPopup extends PopupElement {
  protected _dispose: () => void;
  private _setLoading: (loading: boolean) => void;
  private _setUrl: (url: string) => void;
  private _setKey: (key: string) => void;
  protected btnMore: HTMLElement;

  constructor(readonly props: RtmpAdminPopupProps) {
    super(cnPopup(), {
      overlayClosable: true,
      closable: true,
      title: true,
      body: true
    });

    const {active} = props;

    if(!active) {
      this.btnMore = ButtonMenuToggle({
        buttons: [{
          icon: 'stop',
          regularText: 'Revoke',
          danger: true,
          onClick: () => this._revokeKey()
        }],
        direction: 'bottom-left'
      });
      this.header.append(this.btnMore);
    }

    this.title.append(active ? i18n('Rtmp.StreamPopup.TitleSettings') : i18n('Rtmp.StreamPopup.Title'));
    // if(!document.documentElement.classList.contains('night')) {
    //   this.element.classList.remove('night')
    // }
    this._render();
  }

  private _render() {
    this._dispose = createRoot((dispose) => {
      const [url, setUrl] = createSignal('');
      const [key, setKey] = createSignal('');
      const [loading, setLoading] = createSignal(true);

      this._setLoading = setLoading;
      this._setUrl = setUrl;
      this._setKey = setKey;

      const dispose2 = render(() => (
        <RtmpStartStreamPopupContent
          url={url()}
          key={key()}
          loading={loading()}
          active={Boolean(this.props.active)}
          onStreamStart={() => this._onStreamStart()}
          onRevoked={() => this._revokeKey()}
        />
      ), this.body);

      this._fetchData();

      return () => {
        setUrl('');
        setKey('');
        setLoading(false);
        dispose2();
        dispose();
      };
    });
  }

  private _revokeKey() {
    this._setLoading(true);
    this._fetchData(true);
  }

  private _fetchData(revoke = false) {
    this.managers.appGroupCallsManager.fetchRtmpUrl(this.props.peerId, revoke).then(({url, key}) => {
      this._setUrl(url);
      this._setKey(key);
      this._setLoading(false);
    }).catch(() => {
      toastNew({
        langPackKey: 'Error.AnError'
      });
      this.forceHide();
    });
  }

  private _onStreamStart() {
    this.forceHide();
    if(this.props.active) {
      this.props.onEndStream();
      return;
    }
    const chatId = this.props.peerId.toChatId();
    this.managers.appGroupCallsManager.createGroupCall(chatId, undefined, undefined, true).then(() => {
      rtmpCallsController.joinCall(chatId);
    });
  }

  cleanup() {
    super.cleanup();
    this._dispose();
  }
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
