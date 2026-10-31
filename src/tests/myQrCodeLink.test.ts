import {buildPhoneUrl, chooseOwnLink, formatCountdown, freeLink, isExpiring, isPhonePublic, linkCaption, secondsLeft} from '@components/popups/myQrCode/link';

const all = [{_: 'privacyValueAllowAll'}] as any;
const nobody = [{_: 'privacyValueDisallowAll'}] as any;

describe('qr own link', () => {
  test('username first, then phone, then contact', () => {
    expect(chooseOwnLink({username: 'a', phone: '1', phoneRules: nobody})).toBe('username');
    expect(chooseOwnLink({phone: '1', phoneRules: all})).toBe('phone');
    expect(chooseOwnLink({phone: '1', phoneRules: nobody, addedByPhoneRules: all})).toBe('phone');
    expect(chooseOwnLink({phone: '1', phoneRules: nobody, addedByPhoneRules: nobody})).toBe('contact');
    expect(chooseOwnLink({phoneRules: all})).toBe('contact');
    // rules that have not loaded say no
    expect(chooseOwnLink({phone: '1'})).toBe('contact');
  });

  test('a number reaches us as Android decides it', () => {
    const contacts = [{_: 'privacyValueAllowContacts'}] as any;
    const someone = [{_: 'privacyValueAllowUsers', users: [5]}] as any;
    expect(isPhonePublic(contacts, nobody)).toBe(true);
    // the first deciding rule decides, the others are passed over
    expect(isPhonePublic([...someone, ...nobody, ...all], all)).toBe(true);
    expect(isPhonePublic([...someone, ...nobody, ...all], nobody)).toBe(false);
    // hidden, and finding by number left unset or open to everybody
    expect(isPhonePublic(someone, [])).toBe(true);
    expect(isPhonePublic(nobody, undefined)).toBe(true);
    expect(isPhonePublic(nobody, contacts)).toBe(false);
    expect(isPhonePublic(nobody, someone)).toBe(false);
    expect(isPhonePublic(undefined, all)).toBe(false);
    expect(buildPhoneUrl('123')).toBe('https://t.me/+123');
    expect(linkCaption('username', 'durov')).toEqual({text: '@DUROV', kind: 'username'});
    expect(linkCaption('phone', '123')).toEqual({text: '+123', kind: 'phone'});
  });

  test('countdown', () => {
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(3725)).toBe('1:02:05');
    expect(secondsLeft(10, 9500)).toBe(1);
    expect(secondsLeft(10, 11000)).toBe(0);
    expect(isExpiring(3)).toBe(true);
    expect(isExpiring(4)).toBe(false);
    expect(isExpiring(undefined)).toBe(false);
  });

  test('free link', () => {
    expect(freeLink('https://t.me/a', 'x y')).toBe('https://t.me/a?free=x%20y');
    expect(freeLink('https://t.me/a?b=1', 'x')).toBe('https://t.me/a?b=1&free=x');
  });
});
