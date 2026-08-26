import {getIconContent} from '@components/icon';
import AttachMenuButton from '@components/chat/attachMenuButton';
import {shouldUseReplaceMediaIcon} from '@components/chat/utils';
import {Message} from '@layer';
import {beforeEach, describe, expect, it} from 'vitest';


describe('AttachMenuButton', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('shows the replace icon only when there is media to replace', () => {
    const button = new AttachMenuButton;
    button.feedProps({isReplacingMedia: false});
    document.body.append(button);

    const getIcon = () => button.querySelector<HTMLElement>('.button-icon')?.textContent;

    expect(getIcon()).toBe(getIconContent('attach'));

    button.feedProps({isReplacingMedia: true});
    expect(getIcon()).toBe(getIconContent('replace_squares'));

    button.feedProps({isReplacingMedia: false});
    expect(getIcon()).toBe(getIconContent('attach'));
  });

  it('only enables media replacement while editing replaceable media', () => {
    const textMessage = {_:'message'} as Message.message;
    const photoMessage = {
      _: 'message',
      media: {_:'messageMediaPhoto'}
    } as Message.message;

    expect(shouldUseReplaceMediaIcon(false, photoMessage)).toBe(false);
    expect(shouldUseReplaceMediaIcon(true, textMessage)).toBe(false);
    expect(shouldUseReplaceMediaIcon(true, photoMessage)).toBe(true);
  });
});
