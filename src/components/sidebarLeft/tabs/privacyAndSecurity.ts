import { SliderSuperTab } from "../../slider";
import { generateSection, SettingSection } from "..";
import Row from "../../row";
import { AccountPassword, InputPrivacyKey, PrivacyRule } from "../../../layer";
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

export default class AppPrivacyAndSecurityTab extends SliderSuperTab {
  protected init() {
    this.container.classList.add('privacy-container');
    this.title.innerText = 'Privacy and Security';

    const section = generateSection.bind(null, this.scrollable);

    {
      const section = new SettingSection({noDelimiter: true});

      const blockedUsersRow = new Row({
        icon: 'deleteuser',
        title: 'Blocked Users',
        subtitle: '6 users',
        clickable: true
      });

      let passwordState: AccountPassword;
      const twoFactorRowOptions = {
        icon: 'lock',
        title: 'Two-Step Verification',
        subtitle: 'Loading...',
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

      const activeSessionRow = new Row({
        icon: 'activesessions',
        title: 'Active Sessions',
        subtitle: '3 devices',
        clickable: true
      });

      section.content.append(blockedUsersRow.container, twoFactorRow.container, activeSessionRow.container);
      this.scrollable.append(section.container);

      passwordManager.getState().then(state => {
        passwordState = state;
        twoFactorRow.subtitle.innerText = state.pFlags.has_password ? 'On' : 'Off';
        twoFactorRow.freezed = false;
        
        console.log('password state', state);
      });
    }

    {
      const container = section('Privacy');

      container.classList.add('privacy-navigation-container');

      const rowsByKeys: Partial<{
        [key in InputPrivacyKey['_']]: Row
      }> = {};

      const numberVisibilityRow = rowsByKeys['inputPrivacyKeyPhoneNumber'] = new Row({
        title: 'Who can see my phone number?',
        subtitle: 'My Contacts',
        clickable: () => {
          new AppPrivacyPhoneNumberTab(this.slider).open()
        }
      });

      const lastSeenTimeRow = rowsByKeys['inputPrivacyKeyStatusTimestamp'] = new Row({
        title: 'Who can see your Last Seen time?',
        subtitle: 'Everybody',
        clickable: () => {
          new AppPrivacyLastSeenTab(this.slider).open()
        }
      });

      const photoVisibilityRow = rowsByKeys['inputPrivacyKeyProfilePhoto'] = new Row({
        title: 'Who can see my profile photo?',
        subtitle: 'Everybody',
        clickable: () => {
          new AppPrivacyProfilePhotoTab(this.slider).open();
        }
      });

      const callRow = rowsByKeys['inputPrivacyKeyPhoneCall'] = new Row({
        title: 'Who can call me?',
        subtitle: 'Everybody',
        clickable: () => {
          new AppPrivacyCallsTab(this.slider).open();
        }
      });

      const linkAccountRow = rowsByKeys['inputPrivacyKeyForwards'] = new Row({
        title: 'Who can add a link to my account when forwarding my messages?',
        subtitle: 'Everybody',
        clickable: () => {
          new AppPrivacyForwardMessagesTab(this.slider).open();
        }
      });

      const groupChatsAddRow = rowsByKeys['inputPrivacyKeyChatInvite'] = new Row({
        title: 'Who can add me to group chats?',
        subtitle: 'Everybody',
        clickable: () => {
          new AppPrivacyAddToGroupsTab(this.slider).open();
        }
      });

      for(const key in rowsByKeys) {
        const row = rowsByKeys[key as keyof typeof rowsByKeys];
        appPrivacyManager.getPrivacy(key as keyof typeof rowsByKeys).then(rules => {
          const details = appPrivacyManager.getPrivacyRulesDetails(rules);
          const type = details.type === PrivacyType.Everybody ? 'Everybody' : (details.type === PrivacyType.Contacts ? 'My Contacts' : 'Nobody');
          const disallowLength = details.disallowPeers.users.length + details.disallowPeers.chats.length;
          const allowLength = details.allowPeers.users.length + details.allowPeers.chats.length;
          const str = type + (disallowLength || allowLength ? ` (${[-disallowLength, allowLength ? '+' + allowLength : 0].filter(Boolean).join(', ')})` : '');
          row.subtitle.innerHTML = str;
        });
      }

      container.append(numberVisibilityRow.container, lastSeenTimeRow.container, photoVisibilityRow.container,/*  callRow.container,  */linkAccountRow.container, groupChatsAddRow.container);
    }
  }
}
