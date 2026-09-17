import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {I18nTsx} from '@helpers/solid/i18n';
import rootScope from '@lib/rootScope';
import {AvatarNewTsx} from '@components/avatarNew';
import {IconTsx} from '@components/iconTsx';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import MediaHeader from '@components/mediaHeader';

import css from '@components/popups/webAppLocationAccess.module.scss';

export default function showWebAppLocationAccessPopup(options: {
  botId: PeerId,
  onFinish: (result: boolean) => void
}) {
  const {botId} = options;
  // closing without answering reads as a decline, but the buttons answer for themselves
  let finished = false;
  const finish = (result: boolean) => {
    finished = true;
    options.onFinish(result);
  };

  createPopup(() => (
    <PopupElement
      class={css.popup}
      closable
      onClose={() => !finished && options.onFinish(false)}
    >
      <PopupElement.Body>
        <div class={/* @once */ css.graph}>
          <div class={/* @once */ css.avatarWrap}>
            <AvatarNewTsx
              peerId={rootScope.myId}
              size={64}
            />
            <div class={/* @once */ css.locationIcon}>
              <IconTsx icon="location" />
            </div>
          </div>
          <IconTsx icon="next" />
          <AvatarNewTsx
            peerId={botId}
            size={64}
          />
        </div>

        <MediaHeader.Subtitle>
          <I18nTsx
            key="BotLocationAccessText"
            args={[
              <PeerTitleTsx peerId={botId} />,
              <PeerTitleTsx peerId={botId} />
            ]}
          />
        </MediaHeader.Subtitle>
      </PopupElement.Body>
      <PopupElement.Buttons>
        <PopupElement.Button langKey="Allow" callback={() => finish(true)} />
        <PopupElement.Button langKey="Decline" callback={() => finish(false)} />
      </PopupElement.Buttons>
    </PopupElement>
  ));
}
