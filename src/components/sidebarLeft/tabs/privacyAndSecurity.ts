import SidebarSlider, { SliderSuperTab } from "../../slider";
import { generateSection } from "..";
import Row from "../../row";
import { InputPrivacyKey, PrivacyRule } from "../../../layer";
import appPrivacyManager from "../../../lib/appManagers/appPrivacyManager";
import AppPrivacyPhoneNumberTab from "./privacy/phoneNumber";

export default class AppPrivacyAndSecurityTab extends SliderSuperTab {
  constructor(slider: SidebarSlider) {
    super(slider);
  }

  protected init() {
    this.container.classList.add('privacy-container');
    this.title.innerText = 'Privacy and Security';

    const section = generateSection.bind(null, this.scrollable);

    {
      const container = section('');

      const blockedUsersRow = new Row({
        icon: 'deleteuser',
        title: 'Blocked Users',
        subtitle: '6 users',
        clickable: true
      });

      const twoFactorRow = new Row({
        icon: 'lock',
        title: 'Two-Step Verification',
        subtitle: 'Off',
        clickable: true
      });

      const activeSessionRow = new Row({
        icon: 'activesessions',
        title: 'Active Sessions',
        subtitle: '3 devices',
        clickable: true
      });

      container.append(blockedUsersRow.container, twoFactorRow.container, activeSessionRow.container);
    }

    {
      const container = section('Privacy');

      const rowsByKeys: Partial<{
        [key in InputPrivacyKey['_']]: Row
      }> = {};

      const numberVisibilityRow = rowsByKeys['inputPrivacyKeyPhoneNumber'] = new Row({
        title: 'Who can see my phone number?',
        subtitle: 'My Contacts',
        navigationTab: new AppPrivacyPhoneNumberTab(this.slider)
      });

      const lastSeenTimeRow = rowsByKeys['inputPrivacyKeyStatusTimestamp'] = new Row({
        title: 'Who can see your Last Seen time?',
        subtitle: 'Everybody',
        clickable: true
      });

      const photoVisibilityRow = rowsByKeys['inputPrivacyKeyProfilePhoto'] = new Row({
        title: 'Who can see my profile photo?',
        subtitle: 'Everybody',
        clickable: true
      });

      const linkAccountRow = rowsByKeys['inputPrivacyKeyForwards'] = new Row({
        title: 'Who can add a link to my account when forwarding my messages?',
        subtitle: 'Everybody',
        clickable: true
      });

      const groupChatsAddRow = rowsByKeys['inputPrivacyKeyChatInvite'] = new Row({
        title: 'Who can add me to group chats?',
        subtitle: 'Everybody',
        clickable: true
      });

      for(const key in rowsByKeys) {
        const row = rowsByKeys[key as keyof typeof rowsByKeys];
        appPrivacyManager.getPrivacy(key as keyof typeof rowsByKeys).then(rules => {
          const details = appPrivacyManager.getPrivacyRulesDetails(rules);
          const type = details.type === 2 ? 'Everybody' : (details.type === 1 ? 'My Contacts' : 'Nobody');
          const disallowLength = details.disallowLengths.users + details.disallowLengths.chats;
          const allowLength = details.allowLengths.users + details.allowLengths.chats;
          const str = type + (disallowLength || allowLength ? ` (${[-disallowLength, allowLength ? '+' + allowLength : 0].filter(Boolean).join(', ')})` : '');
          row.subtitle.innerHTML = str;
        });
      }

      container.append(numberVisibilityRow.container, lastSeenTimeRow.container, photoVisibilityRow.container, linkAccountRow.container, groupChatsAddRow.container);
    }
  }
}