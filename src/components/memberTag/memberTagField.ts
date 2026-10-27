import InputField from '@components/inputField';
import {MEMBER_TAG_MAX_LENGTH, MemberTagRole, removeMemberTagEmoji} from '@appManagers/utils/chats/memberTag';

/**
 * The field a tag is typed in. An admin's or the owner's empty field shows what their messages
 * read without a tag; emoji go as they are typed, as no tag may hold one (desktop)
 */
export default function createMemberTagInputField(options: {
  role: MemberTagRole,
  value?: string,
  canBeEdited?: boolean
}) {
  const {role} = options;
  const inputField = new InputField({
    name: 'member-tag',
    label: 'MemberTag.Label',
    placeholder: role === 'owner' ? 'Chat.OwnerBadge' : (role === 'admin' ? 'ChatAdmin' : undefined),
    maxLength: MEMBER_TAG_MAX_LENGTH,
    plainText: true,
    canBeEdited: options.canBeEdited
  });

  if(options.value) {
    inputField.setOriginalValue(removeMemberTagEmoji(options.value), true);
  }

  inputField.input.addEventListener('input', () => {
    const value = inputField.value;
    const cleaned = removeMemberTagEmoji(value);
    if(cleaned !== value) {
      inputField.value = cleaned;
    }
  });

  return inputField;
}
