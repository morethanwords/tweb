import {StaticCheckboxProps, StaticCheckbox} from '@components/staticCheckbox';


export const InMessageCheckbox = (props: Omit<StaticCheckboxProps, 'checkColor' | 'borderColor'> & {
  isOutgoing?: boolean;
}) => {
  return (
    <StaticCheckbox
      {...props}
      checkColor={props.isOutgoing ? 'var(--message-out-background-color)' : undefined}
      borderColor={props.isOutgoing ? 'white' : undefined}
    />
  );
};
