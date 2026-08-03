import CheckboxField from '@components/checkboxField';

export default function createButtonMenuCheckboxFilters<T extends string>({
  filterGroups,
  getState,
  onChange
}: {
  filterGroups: readonly (readonly T[])[],
  getState: () => Record<T, boolean> | undefined,
  onChange: (changes: Partial<Record<T, boolean>>) => void
}) {
  const filters = filterGroups.flat();
  const checkboxFields = Object.fromEntries(filters.map((filter) => [
    filter,
    new CheckboxField({checked: true})
  ])) as Record<T, CheckboxField>;

  const toggleFilter = (filter: T) => {
    const state = getState();
    if(!state) {
      return;
    }

    const changes = {
      [filter]: !state[filter]
    } as Partial<Record<T, boolean>>;
    const nextState = {...state, ...changes};

    for(const group of filterGroups) {
      if(group.some((filter) => nextState[filter])) {
        continue;
      }

      for(const groupFilter of group) {
        if(groupFilter !== filter) {
          changes[groupFilter] = true;
          checkboxFields[groupFilter].checked = true;
        }
      }
    }

    onChange(changes);
  };

  return {
    checkboxFields,
    toggleFilter
  };
}
