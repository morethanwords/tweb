import type {InputGroupCall} from '@layer';

/**
 * Compare two group-call references only when they prove the same identity.
 *
 * A canonical call is identified by `id`; its access hash may be refreshed by
 * a later join response and is authorization material rather than identity.
 * Slugs and invite-message references cannot be safely equated with a canonical
 * id until the server resolves them, so cross-constructor comparisons fail.
 */
export default function sameInputGroupCall(left: InputGroupCall, right: InputGroupCall): boolean {
  if(left._ !== right._) return false;

  switch(left._) {
    case 'inputGroupCall':
      return String(left.id) === String((right as InputGroupCall.inputGroupCall).id);
    case 'inputGroupCallSlug':
      return left.slug === (right as InputGroupCall.inputGroupCallSlug).slug;
    case 'inputGroupCallInviteMessage':
      return left.msg_id === (right as InputGroupCall.inputGroupCallInviteMessage).msg_id;
  }
}
