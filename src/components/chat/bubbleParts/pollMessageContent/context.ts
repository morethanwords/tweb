import {createContext, useContext} from 'solid-js';
import {PollMessageContentProps} from './PollMessageContent';

export const PollMessageContentPropsContext = createContext<PollMessageContentProps>();

export const usePollMessageContentProps = () => {
  return useContext(PollMessageContentPropsContext);
};
