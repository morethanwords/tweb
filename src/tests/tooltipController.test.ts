import tooltipController from '@helpers/tooltipController';

describe('tooltipController', () => {
  test('closes every registered tooltip', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = tooltipController.register(first);
    const unregisterSecond = tooltipController.register(second);

    tooltipController.closeAll();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    unregisterFirst();
    unregisterSecond();
  });

  test('does not close an unregistered tooltip', () => {
    const close = vi.fn();
    const unregister = tooltipController.register(close);
    unregister();

    tooltipController.closeAll();

    expect(close).not.toHaveBeenCalled();
  });
});
