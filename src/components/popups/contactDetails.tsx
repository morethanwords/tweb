import PopupElement, {createPopup} from '@components/popups/indexTsx';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {toastNew} from '@components/toast';
import {makeContactPhoneFormatter} from '@components/wrappers/formatUserPhone';
import {copyTextToClipboard} from '@helpers/clipboard';
import {copyPhoneNumber} from '@helpers/copyContact';
import classNames from '@helpers/string/classNames';
import {isVcardPhoneType, sortVcardItems, VcardItem, VcardItemType} from '@helpers/parseVcard';
import {i18n, LangPackKey} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {For} from 'solid-js';
import styles from '@components/popups/contactDetails.module.scss';

const LABELS: Record<VcardItemType, LangPackKey> = {
  phone: 'Phone',
  phoneMain: 'ContactDetails.PhoneMain',
  phoneHome: 'ContactDetails.PhoneHome',
  phoneMobile: 'ContactDetails.PhoneMobile',
  phoneWork: 'ContactDetails.PhoneWork',
  phoneOther: 'ContactDetails.PhoneOther',
  email: 'ContactDetails.Email',
  address: 'ContactDetails.Address',
  url: 'ContactDetails.Url',
  note: 'ContactDetails.Note',
  birthday: 'Birthday',
  organization: 'ContactDetails.Organization',
  name: 'ContactDetails.Name'
};

const ICONS: Record<VcardItemType, Icon> = {
  phone: 'phone_filled',
  phoneMain: 'phone_filled',
  phoneHome: 'phone_filled',
  phoneMobile: 'phone_filled',
  phoneWork: 'phone_filled',
  phoneOther: 'phone_filled',
  email: 'email_filled',
  address: 'location_filled',
  url: 'link_filled',
  note: 'note_filled',
  birthday: 'birthday_filled',
  organization: 'business_filled',
  name: 'person_filled'
};

function ContactDetailsRow(props: VcardItem & {formatPhone: (phone: string) => string}) {
  const isPhone = isVcardPhoneType(props.type);
  const isUrl = props.type === 'url';
  const text = isPhone ? props.formatPhone(props.value) : props.value;

  const copy = () => {
    if(isPhone) {
      copyPhoneNumber(text);
      return;
    }

    copyTextToClipboard(text);
    toastNew({langPackKey: isUrl ? 'LinkCopied' : 'TextCopied'});
  };

  return (
    <Row
      clickable={copy}
      contextMenu={{
        buttons: [{
          icon: 'copy',
          text: isPhone ? 'Text.CopyLabel_PhoneNumber' : isUrl ? 'CopyLink' : 'Copy',
          onClick: copy
        }]
      }}
    >
      <Row.Icon icon={ICONS[props.type]} />
      <Row.Title>{wrapEmojiText(text)}</Row.Title>
      <Row.Subtitle>{i18n(LABELS[props.type])}</Row.Subtitle>
    </Row>
  );
}

// * The fields of a shared contact's vCard (tdesktop's VcardBoxFactory in history_view_contact.cpp),
// * each copied by a click, as in a profile. `formatPhone`: the bubble's own, so a number reads the same
export default function showContactDetailsPopup(
  items: VcardItem[],
  formatPhone: (phone: string) => string = makeContactPhoneFormatter([])
) {
  createPopup(() => (
    <PopupElement class={classNames('popup-contact-details', styles.popup)} closable>
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title title="ContactDetails" />
      </PopupElement.Header>
      <PopupElement.Scrollable>
        <PopupElement.Body>
          <Section noDelimiter noShadow>
            <For each={sortVcardItems(items)}>{(item) => <ContactDetailsRow {...item} formatPhone={formatPhone} />}</For>
          </Section>
        </PopupElement.Body>
      </PopupElement.Scrollable>
    </PopupElement>
  ));
}
