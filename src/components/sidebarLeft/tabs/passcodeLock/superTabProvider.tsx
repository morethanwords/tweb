import {createContext, useContext, ParentComponent} from 'solid-js';

import {InstanceOf} from '../../../../types';

import type SliderSuperTab from '../../../sliderTab';

import type {AllPasscodeLockTabs} from '.';

const SuperTabContext = createContext<[SliderSuperTab, AllPasscodeLockTabs]>(null);

type SuperTabProviderProps = {
  self: SliderSuperTab;
  allTabs: AllPasscodeLockTabs;
};

export const SuperTabProvider: ParentComponent<SuperTabProviderProps> = (props) => {
  return (
    <SuperTabContext.Provider value={[props.self, props.allTabs]}>
      {props.children}
    </SuperTabContext.Provider>
  );
};

export const useSuperTab = <TabClass extends typeof SliderSuperTab>() =>
  useContext(SuperTabContext) as [InstanceOf<TabClass>, AllPasscodeLockTabs];
