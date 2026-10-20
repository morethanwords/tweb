import {createSignal} from 'solid-js';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import type InputField from '@components/inputField';
import MemberTagPreview from '@components/memberTag/memberTagPreview';
import {cleanMemberTag, MemberTagRole} from '@appManagers/utils/chats/memberTag';
import styles from '@components/memberTag/memberTagEditor.module.scss';

type MemberTagFieldProps = {
  chatPeerId: PeerId,
  peerId: PeerId,
  role: MemberTagRole,
  inputField: InputField
};

/**
 * How the author's message will look with the tag the field holds, following it as it is typed
 */
export function MemberTagFieldPreview(props: MemberTagFieldProps & {class?: string}) {
  const {inputField} = props;
  const [value, setValue] = createSignal(inputField.value);
  subscribeOn(inputField.input)('input', () => setValue(inputField.value));

  return (
    <MemberTagPreview
      class={props.class}
      chatPeerId={props.chatPeerId}
      peerId={props.peerId}
      rank={cleanMemberTag(value())}
      role={props.role}
    />
  );
}

/**
 * A tag's editor (desktop's EditTagControl): how the author's message will look, then the field.
 * The same piece stands in the admin and permissions tabs
 */
export default function MemberTagEditor(props: MemberTagFieldProps) {
  return (
    <div class={styles.editor}>
      <MemberTagFieldPreview {...props} />
      {props.inputField.container}
    </div>
  );
}
