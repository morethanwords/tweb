import {buildPhoneUrl, chooseOwnLink, formatCountdown, freeLink, isExpiring, isNobody, linkCaption, secondsLeft} from '@components/popups/myQrCode/link';

const all = [{_: 'privacyValueAllowAll'}] as any;
const nobody = [{_: 'privacyValueDisallowAll'}] as any;

describe('qr own link', () => {
  test('username first, then phone, then contact', () => {
    expect(chooseOwnLink({username: 'a', phone: '1', phoneRules: nobody})).toBe('username');
    expect(chooseOwnLink({phone: '1', phoneRules: all})).toBe('phone');
    expect(chooseOwnLink({phone: '1', phoneRules: nobody, addedByPhoneRules: all})).toBe('phone');
    expect(chooseOwnLink({phone: '1', phoneRules: nobody, addedByPhoneRules: nobody})).toBe('contact');
    expect(chooseOwnLink({phoneRules: all})).toBe('contact');
    expect(isNobody([{_: 'privacyValueAllowUsers'}] as any)).toBe(true);
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
