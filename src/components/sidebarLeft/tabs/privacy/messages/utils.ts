import {InputUser} from '../../../../../layer';

// Note: after saving privacy rules, the cached users are objects instead of being numbers
export const getUserId = (user: InputUser.inputUser | string | number) => {
  if(user instanceof Object) return user.user_id?.toPeerId(true);
  return user.toPeerId(true);
};
