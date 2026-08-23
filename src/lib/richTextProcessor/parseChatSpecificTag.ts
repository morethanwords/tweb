import {isUsernameValid} from '@lib/richTextProcessor/validators';

export default function parseChatSpecificTag(value: string) {
  const prefix = value[0] === '$' ? '$' : '#';
  const tag = prefix === '$' ? value.slice(1) : value;
  const separatorIndex = tag.indexOf('@');
  const username = separatorIndex > 0 ? tag.slice(separatorIndex + 1) : undefined;

  if(!username || !isUsernameValid(username)) {
    return {query: prefix + tag};
  }

  return {
    query: prefix + tag.slice(0, separatorIndex),
    username
  };
}
