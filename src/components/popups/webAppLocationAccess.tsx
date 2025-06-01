import PopupElement from '.';
import safeAssign from '../../helpers/object/safeAssign';
import {I18nTsx} from '../../helpers/solid/i18n';
import rootScope from '../../lib/rootScope';
import {AvatarNewTsx} from '../avatarNew';
import {IconTsx} from '../iconTsx';
import {PeerTitleTsx} from '../peerTitleTsx';

import css from './webAppLocationAccess.module.scss';

export default class PopupWebAppLocationAccess extends PopupElement<{
  finish: (result: boolean) => void
}> {
  private botId: PeerId;

  constructor(options: {
    botId: PeerId,
  }) {
    let finished = false;
    super(css.popup, {
      overlayClosable: true,
      body: true,
      buttons: [
        {
          langKey: 'Allow',
          callback: () => {
            finished = true
            this.dispatchEvent('finish', true);
          }
        },
        {
          langKey: 'Decline',
          callback: () => {
            finished = true
            this.dispatchEvent('finish', false);
          }
        }
      ]
    });

    this.addEventListener('close', () => {
      if(!finished) {
        this.dispatchEvent('finish', false);
      }
    });

    safeAssign(this, options);

    this.header.remove()

    this.appendSolidBody(() => this._construct());
  }

  protected _construct() {
    return (
      <>
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
            peerId={this.botId}
            size={64}
          />
        </div>

        <div class={/* @once */ css.text}>
          <I18nTsx
            key="BotLocationAccessText"
            args={[
              <PeerTitleTsx peerId={this.botId} />,
              <PeerTitleTsx peerId={this.botId} />
            ]}
          />
        </div>
      </>
    )
  }
}
