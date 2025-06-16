import {createResource, Show, JSX} from 'solid-js';
import {PeerSettings, User, UserFull} from '../../../layer';

import classNames from '../../../helpers/string/classNames';
import {PeerTitleTsx} from '../../peerTitleTsx';

import stylesCommon from './service.module.scss';
import styles from './unknownUser.module.scss';

import {I18nTsx} from '../../../helpers/solid/i18n';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import {getCountryEmoji} from '../../../vendor/emoji';
import I18n from '../../../lib/langPack';
import {monthsLocalized} from '../../../helpers/date';
import {IconTsx} from '../../iconTsx';
import formatDuration from '../../../helpers/formatDuration';
import {wrapFormattedDuration} from '../../wrappers/wrapDuration';
import rootScope from '../../../lib/rootScope';
import appSidebarRight from '../../sidebarRight';
import {StackedAvatarsTsx} from '../../stackedAvatars';
import {wrapAdaptiveCustomEmoji} from '../../wrappers/customEmojiSimple';
import wrapRichText from '../../../lib/richTextProcessor/wrapRichText';

export function UnknownUserBubble(props: {
  peerId: PeerId,
  user: User.user,
  userFull: UserFull,
  peerSettings?: PeerSettings
}) {
  const countryName = () => {
    const country = I18n.countriesList.find((it) => it.iso2 === props.peerSettings.phone_country);
    return country?.name ?? country?.default_name;
  };

  const registrationDate = () => {
    const m = props.peerSettings.registration_month.match(/^(\d{2})\.(\d{4})$/);
    if(!m) return props.peerSettings.registration_month;

    const [, month, year] = m;
    return monthsLocalized[Number(month) - 1] + ' ' + year;
  };

  const [commonChats] = createResource(() => {
    if(!props.userFull.common_chats_count) return;
    return rootScope.managers.appUsersManager.getCommonChats(props.peerId.toUserId(), 3, 0);
  });

  const Footer = (props: {
    icon: JSX.Element,
    text: JSX.Element
  }) => {
    return (
      <div class={/* @once */ styles.footer}>
        <span class={/* @once */ styles.footerIcon}>{props.icon}</span>
        <span class={/* @once */ styles.footerText}>{props.text}</span>
      </div>
    );
  };

  return (
    <Show when={props.peerSettings?.phone_country || props.peerSettings?.registration_month}>
      <div class={/* @once */ styles.spacerTop} />
      <div class={/* @once */ classNames(stylesCommon.addon, styles.bubble)}>
        <div class={/* @once */ styles.head}>
          <PeerTitleTsx
            peerId={props.peerId}
            class={/* @once */ styles.peerTitle}
          />
          {!props.user.pFlags.contact && (
            <I18nTsx
              class={/* @once */ styles.notAContact}
              key="UnknownUserNotAContact"
            />
          )}
        </div>
        <div class={/* @once */ styles.table}>
          <div class={/* @once */ styles.tableLeft}>
            {props.peerSettings.phone_country && <I18nTsx key="UnknownUserPhoneNumber" />}
            {props.peerSettings.registration_month && <I18nTsx key="UnknownUserRegistrationDate" />}
            {props.userFull.common_chats_count && <I18nTsx key="UnknownUserSharedGroups" />}
          </div>
          <div class={/* @once */ styles.tableRight}>
            {props.peerSettings.phone_country && (
              <div class={/* @once */ styles.phoneCountry}>
                {wrapEmojiText(getCountryEmoji(props.peerSettings.phone_country))}
                {countryName()}
              </div>
            )}
            {props.peerSettings.registration_month && registrationDate()}
            {props.userFull.common_chats_count && (
              <div
                class={/* @once */ styles.commonChats}
                onClick={() => {
                  appSidebarRight.toggleSidebar(true);
                }}
              >
                <I18nTsx
                  key="RequestPeer.MultipleLimit.Groups"
                  args={String(props.userFull.common_chats_count)}
                />
                <StackedAvatarsTsx
                  peerIds={commonChats()?.chats.map((chat) => chat.id.toPeerId(true)) ?? []}
                  avatarSize={18}
                />
                <IconTsx class={styles.commonChatsArrow} icon="next" />
              </div>
            )}
          </div>
        </div>
        {!props.user.pFlags.verified && !props.user.pFlags.support && !props.user.bot_verification_icon && (
          <Footer
            icon={<IconTsx icon="info2" />}
            text={<I18nTsx key="UnknownUserUnofficial" />}
          />
        )}
        {props.user.bot_verification_icon && (
          <Footer
            icon={wrapAdaptiveCustomEmoji({
              docId: props.user.bot_verification_icon,
              size: 32,
              as: 'span',
              wrapOptions: {
                textColor: 'white'
              }
            }).container}
            text={wrapRichText(props.userFull.bot_verification.description)}
          />
        )}
      </div>

      <div class={/* @once */ styles.spacerBottom} />

      {props.peerSettings?.name_change_date && (
        <div class={/* @once */ classNames(stylesCommon.text, styles.text)}>
          <I18nTsx
            key="UnknownUserName"
            args={[wrapFormattedDuration(
              formatDuration((Date.now() - props.peerSettings.name_change_date * 1000) / 1000, 1)
            )]}
          />
        </div>
      )}

      {props.peerSettings?.photo_change_date && (
        <div class={/* @once */ classNames(stylesCommon.text, styles.text)}>
          <I18nTsx
            key="UnknownUserPhoto"
            args={[wrapFormattedDuration(
              formatDuration((Date.now() - props.peerSettings.photo_change_date * 1000) / 1000, 1)
            )]}
          />
        </div>
      )}
    </Show>
  )
}
