import DropdownHover from '@helpers/dropdownHover';

vi.mock('@components/appNavigationController', () => ({default: {
  pushItem: vi.fn(),
  removeItem: vi.fn()
}}));
vi.mock('@environment/touchSupport', () => ({default: true}));

class SlidingDropdown extends DropdownHover {
  protected getCloseDelay() {
    return 250;
  }
}

afterEach(() => vi.useRealTimers());

it('keeps the panel laid out until its closing slide ends', async() => {
  vi.useFakeTimers();
  const element = document.createElement('div');
  element.style.display = 'none';
  const dropdown = new SlidingDropdown({element});
  const closed = vi.fn();
  dropdown.addEventListener('closed', closed);
  await dropdown.toggle(true);
  await dropdown.toggle(false);
  vi.advanceTimersByTime(249);
  expect(element.style.display).toBe('');
  expect(closed).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(element.style.display).toBe('none');
  expect(closed).toHaveBeenCalledOnce();
});

it('does not hide a panel reopened during its closing slide', async() => {
  vi.useFakeTimers();
  const element = document.createElement('div');
  element.style.display = 'none';
  const dropdown = new SlidingDropdown({element});
  await dropdown.toggle(true);
  await dropdown.toggle(false);
  vi.advanceTimersByTime(100);
  await dropdown.toggle(true);
  vi.advanceTimersByTime(300);
  expect(element.style.display).toBe('');
  expect(dropdown.isActive()).toBe(true);
});
