import {createComputed} from 'solid-js';
import {attachHotClassName} from '../../../helpers/solid/classname';
import defineSolidElement, {PassedProps} from '../../../lib/solidjs/defineSolidElement';
import {CommittedFilters} from '../../sidebarRight/tabs/adminRecentActions/filters';
import {FlagFilters} from '../../sidebarRight/tabs/adminRecentActions/filters/flagFilters';
import {useFlagFilters} from '../../sidebarRight/tabs/adminRecentActions/filters/useFlagFilters';
import styles from './styles.module.scss';

if(import.meta.hot) import.meta.hot.accept();


export type LogFiltersPopupContentProps = {
  channelId: ChatId;
  committedFilters?: CommittedFilters | null;
  onFinish: (payload: FinishPayload) => void;
};

export type FinishPayload = {
  committedFilters?: CommittedFilters | null;
};

const LogFiltersPopupContent = defineSolidElement({
  name: 'log-filters-popup-content',
  component: (props: PassedProps<LogFiltersPopupContentProps>) => {
    attachHotClassName(props.element, styles.Container);

    const filtersControls = useFlagFilters({channelId: () => props.channelId});

    createComputed(() => {
      console.log('my-debug', props.committedFilters);
      filtersControls.setFromCommittedFilters(props.committedFilters);
    });

    const onCommit = (committedFilters?: CommittedFilters) => {
      props.onFinish({committedFilters});
    };

    return <>
      <FlagFilters
        filtersControls={filtersControls}
        onCommit={onCommit}
        onReset={() => onCommit()}
      />
    </>;
  }
});

export default LogFiltersPopupContent;
