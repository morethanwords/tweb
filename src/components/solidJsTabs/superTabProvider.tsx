import {createContext, ParentComponent, useContext} from 'solid-js';
import type {ProvidedTabs} from '.';
import {InstanceOf} from '../../types';
import type SliderSuperTab from '../sliderTab';


const SuperTabContext = createContext<[SliderSuperTab, ProvidedTabs]>();

type SuperTabProviderProps = {
  self: SliderSuperTab;
  allTabs: ProvidedTabs;
};

export const SuperTabProvider: ParentComponent<SuperTabProviderProps> = (props) => {
  return (
    <SuperTabContext.Provider value={[props.self, props.allTabs]}>
      {props.children}
    </SuperTabContext.Provider>
  );
};

export const useSuperTab = <TabClass extends typeof SliderSuperTab>() =>
  useContext(SuperTabContext) as [InstanceOf<TabClass>, ProvidedTabs];
