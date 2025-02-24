import { createContext, useContext, ParentComponent } from "solid-js";

import type SliderSuperTab from "../../../sliderTab";

const ThisSuperTabContext = createContext<SliderSuperTab>(null);

type ThisSuperTabProviderProps = {
  value: SliderSuperTab;
};

export const ThisSuperTabProvider: ParentComponent<ThisSuperTabProviderProps> = (props) => {
  return (
    <ThisSuperTabContext.Provider value={props.value}>
      {props.children}
    </ThisSuperTabContext.Provider>
  );
};

export const useThisSuperTab = () => useContext(ThisSuperTabContext);
