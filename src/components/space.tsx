import {JSX, splitProps} from 'solid-js';

export default function Space(
  inProps: JSX.HTMLAttributes<HTMLDivElement> & {
    amount: string;
    withTransition?: boolean;
  }
) {
  const [props, divProps] = splitProps(inProps, ['amount', 'withTransition']);
  return (
    <div {...divProps} style={{'padding-top': props.amount, 'transition': props.withTransition ? '.2s' : undefined}} />
  );
}
