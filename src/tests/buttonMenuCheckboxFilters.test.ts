import createButtonMenuCheckboxFilters from '@components/buttonMenuCheckboxFilters';

vi.mock('@components/checkboxField', () => ({
  default: class {
    public checked: boolean;

    constructor({checked}: {checked: boolean}) {
      this.checked = checked;
    }
  }
}));

describe('button menu checkbox filters', () => {
  test('keeps at least one filter enabled in every group', () => {
    const state = {
      photos: false,
      videos: true
    };
    const {checkboxFields, toggleFilter} = createButtonMenuCheckboxFilters({
      filterGroups: [['photos', 'videos']] as const,
      getState: () => state,
      onChange: (changes) => Object.assign(state, changes)
    });
    checkboxFields.photos.checked = false;

    toggleFilter('videos');

    expect(state).toEqual({
      photos: true,
      videos: false
    });
    expect(checkboxFields.photos.checked).toBe(true);
  });

  test('does not change another filter group', () => {
    const state = {
      limited: false,
      unlimited: true,
      displayed: true,
      hidden: false
    };
    const {toggleFilter} = createButtonMenuCheckboxFilters({
      filterGroups: [['limited', 'unlimited'], ['displayed', 'hidden']] as const,
      getState: () => state,
      onChange: (changes) => Object.assign(state, changes)
    });

    toggleFilter('unlimited');

    expect(state).toEqual({
      limited: true,
      unlimited: false,
      displayed: true,
      hidden: false
    });
  });
});
