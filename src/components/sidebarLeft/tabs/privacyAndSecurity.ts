import { SliderSuperTab } from "../../slider";
import { generateSection, SettingSection } from "..";
import Row from "../../row";
import { AccountPassword, Authorization, InputPrivacyKey } from "../../../layer";
import appPrivacyManager, { PrivacyType } from "../../../lib/appManagers/appPrivacyManager";
import AppPrivacyPhoneNumberTab from "./privacy/phoneNumber";
import AppTwoStepVerificationTab from "./2fa";
import passwordManager from "../../../lib/mtproto/passwordManager";
import AppTwoStepVerificationEnterPasswordTab from "./2fa/enterPassword";
import AppTwoStepVerificationEmailConfirmationTab from "./2fa/emailConfirmation";
import AppPrivacyLastSeenTab from "./privacy/lastSeen";
import AppPrivacyProfilePhotoTab from "./privacy/profilePhoto";
import AppPrivacyForwardMessagesTab from "./privacy/forwardMessages";
import AppPrivacyAddToGroupsTab from "./privacy/addToGroups";
import AppPrivacyCallsTab from "./privacy/calls";
import AppActiveSessionsTab from "./activeSessions";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import AppBlockedUsersTab from "./blockedUsers";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import rootScope from "../../../lib/rootScope";
import { convertKeyToInputKey } from "../../../helpers/string";

export default class AppPrivacyAndSecurityTab extends SliderSuperTab {
  private activeSessionsRow: Row;
  private authorizations: Authorization.authorization[];

  protected init() {
    this.container.classList.add('privacy-container');
    this.title.innerText = 'Privacy and Security';

    const section = generateSection.bind(null, this.scrollable);

    const SUBTITLE = 'Loading...';

    {
      const section = new SettingSection({noDelimiter: true});

      let blockedPeerIds: number[];
      const blockedUsersRow = new Row({
        icon: 'deleteuser',
        title: 'Blocked Users',
        subtitle: SUBTITLE,
        clickable: () => {
          const tab = new AppBlockedUsersTab(this.slider);
          tab.peerIds = blockedPeerIds;
          tab.open();
        }
      });
      blockedUsersRow.freezed = true;

      let passwordState: AccountPassword;
      const twoFactorRowOptions = {
        icon: 'lock',
        title: 'Two-Step Verification',
        subtitle: SUBTITLE,
        clickable: (e: Event) => {
          let tab: AppTwoStepVerificationTab | AppTwoStepVerificationEnterPasswordTab | AppTwoStepVerificationEmailConfirmationTab;
          if(passwordState.pFlags.has_password) {
            tab = new AppTwoStepVerificationEnterPasswordTab(this.slider);
          } else if(passwordState.email_unconfirmed_pattern) {
            tab = new AppTwoStepVerificationEmailConfirmationTab(this.slider);
            tab.email = passwordState.email_unconfirmed_pattern;
            tab.length = 6;
            tab.isFirst = true;
            passwordManager.resendPasswordEmail();
          } else {
            tab = new AppTwoStepVerificationTab(this.slider);
          }
          
          tab.state = passwordState;
          tab.open();
        }
      };
      
      const twoFactorRow = new Row(twoFactorRowOptions);
      twoFactorRow.freezed = true;

      const activeSessionsRow = this.activeSessionsRow = new Row({
        icon: 'activesessions',
        title: 'Active Sessions',
        subtitle: SUBTITLE,
        clickable: () => {
          const tab = new AppActiveSessionsTab(this.slider);
          tab.privacyTab = this;
          tab.authorizations = this.authorizations;
          tab.open();
        }
      });
      activeSessionsRow.freezed = true;

      section.content.append(blockedUsersRow.container, twoFactorRow.container, activeSessionsRow.container);
      this.scrollable.append(section.container);

      let blockedCount: number;
      const setBlockedCount = (count: number) => {
        blockedCount = count;
        blockedUsersRow.subtitle.innerText = count ? (count + ' ' + (count > 1 ? 'users' : 'user')) : 'None';
      };

      this.listenerSetter.add(rootScope, 'peer_block', () => {
        /* const {blocked, peerId} = update;
        if(!blocked) blockedPeerIds.findAndSplice(p => p === peerId);
        else blockedPeerIds.unshift(peerId);
        blockedCount += blocked ? 1 : -1;
        setBlockedCount(blockedCount); */
        updateBlocked();
      });

      const updateBlocked = () => {
        appUsersManager.getBlocked().then(res => {
          blockedUsersRow.freezed = false;
          setBlockedCount(res.count);
          blockedPeerIds = res.peerIds;
        });
      };

      updateBlocked();

      passwordManager.getState().then(state => {
        passwordState = state;
        twoFactorRow.subtitle.innerText = state.pFlags.has_password ? 'On' : 'Off';
        twoFactorRow.freezed = false;
        
        //console.log('password state', state);
      });

      this.updateActiveSessions();
    }

    {
      const container = section('Privacy');

      container.classList.add('privacy-navigation-container');

      const rowsByKeys: Partial<{
        [key in InputPrivacyKey['_']]: Row
      }> = {};

      const numberVisibilityRow = rowsByKeys['inputPrivacyKeyPhoneNumber'] = new Row({
        title: 'Who can see my phone number?',
        subtitle: SUBTITLE,
        clickable: () => {
          new AppPrivacyPhoneNumberTab(this.slider).open()
        }
      });

      const lastSeenTimeRow = rowsByKeys['inputPrivacyKeyStatusTimestamp'] = new Row({
        title: 'Who can see your Last Seen time?',
        subtitle: SUBTITLE,
        clickable: () => {
          new AppPrivacyLastSeenTab(this.slider).open()
        }
      });

      const photoVisibilityRow = rowsByKeys['inputPrivacyKeyProfilePhoto'] = new Row({
        title: 'Who can see my profile photo?',
        subtitle: SUBTITLE,
        clickable: () => {
          new AppPrivacyProfilePhotoTab(this.slider).open();
        }
      });

      const callRow = rowsByKeys['inputPrivacyKeyPhoneCall'] = new Row({
        title: 'Who can call me?',
        subtitle: SUBTITLE,
        clickable: () => {
          new AppPrivacyCallsTab(this.slider).open();
        }
      });

      const linkAccountRow = rowsByKeys['inputPrivacyKeyForwards'] = new Row({
        title: 'Who can add a link to my account when forwarding my messages?',
        subtitle: SUBTITLE,
        clickable: () => {
          new AppPrivacyForwardMessagesTab(this.slider).open();
        }
      });

      const groupChatsAddRow = rowsByKeys['inputPrivacyKeyChatInvite'] = new Row({
        title: 'Who can add me to group chats?',
        subtitle: SUBTITLE,
        clickable: () => {
          new AppPrivacyAddToGroupsTab(this.slider).open();
        }
      });

      const updatePrivacyRow = (key: InputPrivacyKey['_']) => {
        const row = rowsByKeys[key];
        if(!row) {
          return;
        }

        appPrivacyManager.getPrivacy(key).then(rules => {
          const details = appPrivacyManager.getPrivacyRulesDetails(rules);
          const type = details.type === PrivacyType.Everybody ? 'Everybody' : (details.type === PrivacyType.Contacts ? 'My Contacts' : 'Nobody');
          const disallowLength = details.disallowPeers.users.length + details.disallowPeers.chats.length;
          const allowLength = details.allowPeers.users.length + details.allowPeers.chats.length;
          const str = type + (disallowLength || allowLength ? ` (${[-disallowLength, allowLength ? '+' + allowLength : 0].filter(Boolean).join(', ')})` : '');
          row.subtitle.innerHTML = str;
        });
      };

      for(const key in rowsByKeys) {
        updatePrivacyRow(key as keyof typeof rowsByKeys);
      }

      rootScope.on('privacy_update', (update) => {
        updatePrivacyRow(convertKeyToInputKey(update.key._) as any);
      });

      container.append(numberVisibilityRow.container, lastSeenTimeRow.container, photoVisibilityRow.container, callRow.container, linkAccountRow.container, groupChatsAddRow.container);
    }
  }

  public updateActiveSessions() {
    apiManager.invokeApi('account.getAuthorizations').then(auths => {
      this.activeSessionsRow.freezed = false;
      this.authorizations = auths.authorizations;
      this.activeSessionsRow.subtitle.innerText = this.authorizations.length + ' ' + (this.authorizations.length !== 1 ? 'devices' : 'device');
      //console.log('auths', auths);
    });
  }
}
