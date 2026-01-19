import {createContext, ParentComponent, useContext} from 'solid-js';
import {InstanceOf} from '@types';
import type SliderSuperTab from '@components/sliderTab';
import {ProvidedTabs} from '@components/solidJsTabs/providedTabs';


const SuperTabContext = createContext<[SliderSuperTab, ProvidedTabs]>();

type SuperTabProviderProps = {
  self: SliderSuperTab;
};

export const SuperTabProvider: ParentComponent<SuperTabProviderProps> & {
  allTabs: ProvidedTabs;
} = (props) => {
  return (
    <SuperTabContext.Provider value={[props.self, SuperTabProvider.allTabs]}>
      {props.children}
    </SuperTabContext.Provider>
  );
};

SuperTabProvider.allTabs = {} as ProvidedTabs; // will get reassigned in index.ts

export const useSuperTab = <TabClass extends typeof SliderSuperTab>() =>
  useContext(SuperTabContext) as [InstanceOf<TabClass>, ProvidedTabs];
