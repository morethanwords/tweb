import {
  canShowAttachMenuAction,
  isRichMessageAttachMenuActionAllowed,
  RichMessageAttachMenuAction
} from '@components/chat/inputEditor/attachMenuPolicy';
import {validateRichMessage} from '@appManagers/utils/richMessage/validateRichMessage';

describe('rich-message Attach menu policy', () => {
  test.each<RichMessageAttachMenuAction>([
    'visualMedia',
    'audio',
    'location',
    'groupCollage',
    'groupSlideshow'
  ])('allows the rich-message action %s', (action) => {
    expect(isRichMessageAttachMenuActionAllowed(action)).toBe(true);
    expect(canShowAttachMenuAction(action, true)).toBe(true);
  });

  test.each<RichMessageAttachMenuAction>([
    'document',
    'editMedia',
    'giftPremium',
    'poll',
    'standaloneChecklist',
    'attachBot'
  ])('hides the standalone action %s while the editor is expanded', (action) => {
    expect(isRichMessageAttachMenuActionAllowed(action)).toBe(false);
    expect(canShowAttachMenuAction(action, true)).toBe(false);
  });

  test('defaults unknown expanded-editor actions to hidden', () => {
    expect(canShowAttachMenuAction(undefined, true)).toBe(false);
    expect(canShowAttachMenuAction(undefined, false)).toBe(true);
  });

  test('does not filter the ordinary collapsed Attach menu', () => {
    const actions: RichMessageAttachMenuAction[] = [
      'visualMedia',
      'audio',
      'document',
      'poll',
      'standaloneChecklist',
      'attachBot'
    ];

    expect(actions.every((action) => canShowAttachMenuAction(action, false)))
    .toBe(true);
  });

  test('accepts an editor checklist as a rich-message list block', () => {
    const result = validateRichMessage([{
      _: 'pageBlockList',
      items: [{
        _: 'pageListItemText',
        pFlags: {checkbox: true},
        text: {_: 'textPlain', text: 'Task'}
      }, {
        _: 'pageListItemText',
        pFlags: {checkbox: true, checked: true},
        text: {_: 'textPlain', text: 'Done'}
      }]
    }]);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
