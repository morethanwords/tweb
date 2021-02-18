import SidebarSlider, { SliderSuperTab } from "../../../slider";
import { InputPrivacyKey, PrivacyRule } from "../../../../layer";
import appSidebarLeft, { generateSection, SettingSection } from "../..";
import Scrollable from "../../../scrollable";
import RadioField from "../../../radioField";
import Row, { RadioFormFromRows } from "../../../row";
import appPrivacyManager from "../../../../lib/appManagers/appPrivacyManager";

export default class AppPrivacyPhoneNumberTab extends SliderSuperTab {
  constructor(slider: SidebarSlider) {
    super(slider);
  }

  protected init() {
    this.container.classList.add('privacy-phone-number');
    this.title.innerHTML = 'Phone Number';

    const PrivacySection = (options: {
      title: string, 
      inputKey: InputPrivacyKey['_'], 
      caption: string,
      appendTo: Scrollable
    }) => {
      const section = new SettingSection({name: options.title, caption: options.caption});

      const everybodyRow = new Row({
        radioField: RadioField('Everybody', 'no-matter', 'everybody')
      });
  
      const contactsRow = new Row({
        radioField: RadioField('My Contacts', 'no-matter', 'contacts')
      });
  
      const nobodyRow = new Row({
        radioField: RadioField('Nobody', 'no-matter', 'nobody')
      });

      const form = RadioFormFromRows([everybodyRow, contactsRow, nobodyRow], () => {});

      section.content.append(form);
      options.appendTo.append(section.container);

      const container = generateSection(options.appendTo, 'Exceptions', 'You can add users or entire groups as exceptions that will override settings above.');

      const neverShareRow = new Row({
        icon: 'deleteuser',
        title: 'Never Share With',
        subtitle: 'Add Users',
        clickable: true
      });

      const alwaysShareRow = new Row({
        icon: 'adduser',
        title: 'Always Share With',
        subtitle: 'Add Users',
        clickable: true
      });

      neverShareRow.container.addEventListener('click', () => {
        appPrivacyManager.getPrivacy(options.inputKey).then(rules => {
          const peerIds: number[] = [];
          
          const usersRule: PrivacyRule.privacyValueDisallowUsers = rules.find(r => r._ === 'privacyValueDisallowUsers') as any;
          if(usersRule) usersRule.users.forEach(u => peerIds.push(u));

          const chatsRule: PrivacyRule.privacyValueDisallowChatParticipants = rules.find(r => r._ === 'privacyValueDisallowChatParticipants') as any;
          if(chatsRule) chatsRule.chats.forEach(c => peerIds.push(-c));

          appSidebarLeft.addMembersTab.open({
            type: 'privacy',
            skippable: true,
            title: 'Never Share With',
            placeholder: 'Add Users or Groups...',
            takeOut: (peerIds) => {
              
            },
            selectedPeerIds: peerIds
          });
        });
      });

      /* alwaysShareRow.container.addEventListener('click', () => {
        appSidebarLeft.addMembersTab.open({
          type: 'privacy',
          skippable: true,
          title: 'Always Share With',
          placeholder: 'Add Users or Groups...',
          takeOut: (peerIds) => {
            
          }
        });
      }); */

      container.append(neverShareRow.container, alwaysShareRow.container);

      appPrivacyManager.getPrivacy(options.inputKey).then(rules => {
        const details = appPrivacyManager.getPrivacyRulesDetails(rules);
        const row = details.type === 2 ? everybodyRow : (details.type === 1 ? contactsRow : nobodyRow);

        row.radioField.input.checked = true;
        
        const generateStr = (lengths: {users: number, chats: number}) => {
          if(!lengths.users && !lengths.chats) {
            return 'Add Users';
          }

          return [
            lengths.users ? lengths.users + ' ' + (lengths.users === 1 ? 'user' : 'users') : '', 
            lengths.chats ? lengths.chats + ' ' + (lengths.chats === 1 ? 'chat' : 'chats') : ''
          ].filter(Boolean).join(', ');
        };

        neverShareRow.subtitle.innerHTML = generateStr(details.disallowLengths);
        alwaysShareRow.subtitle.innerHTML = generateStr(details.allowLengths);
      });
    };

    PrivacySection({
      title: 'Who can see your phone number?',
      inputKey: 'inputPrivacyKeyPhoneNumber',
      caption: 'Users who have your number saved in their contacts will also see it on Telegram.',
      appendTo: this.scrollable
    });
  }
}