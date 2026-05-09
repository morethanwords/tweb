import {StaticCheckboxProps, StaticCheckbox} from '@components/staticCheckbox';


export const InMessageCheckbox = (inProps: Omit<StaticCheckboxProps, 'checkColor'> & {
  isOutgoing?: boolean;
}) => {
  return <StaticCheckbox
    {...inProps}
    checkColor={inProps.isOutgoing ? 'var(--message-out-background-color)' : undefined}
    borderColor={inProps.isOutgoing ? 'white' : undefined}
  />;
};
