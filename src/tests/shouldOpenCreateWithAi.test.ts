import shouldOpenCreateWithAi from '@components/chat/inputState/shouldOpenCreateWithAi';

describe('Create with AI routing', () => {
  test('opens only for an empty rich-editor selection in expanded mode', () => {
    expect(shouldOpenCreateWithAi(true, {from: 4, to: 4})).toBe(true);
    expect(shouldOpenCreateWithAi(false, {from: 4, to: 4})).toBe(false);
    expect(shouldOpenCreateWithAi(true, {from: 4, to: 8})).toBe(false);
    expect(shouldOpenCreateWithAi(true, {from: 4, to: 8, type: 'cell'})).toBe(false);
    expect(shouldOpenCreateWithAi(true)).toBe(false);
  });
});
