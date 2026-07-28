import type {BotCommand} from '@layer';

export type EphemeralCommandCandidate = {
  botId: UserId,
  username?: string,
  commands?: BotCommand[],
  available?: boolean
};

export type EphemeralCommandResolution = {
  state: 'none' | 'ambiguous' | 'unavailable'
} | {
  state: 'resolved',
  receiverId: UserId
};

function parseCommand(text: string) {
  const match = /^\/([a-z0-9_]+)(?:@([a-z0-9_]+))?(?=\s|$)/i.exec(text.trim());
  if(!match) {
    return;
  }

  return {
    command: match[1].toLowerCase(),
    username: match[2]?.toLowerCase()
  };
}

export default function resolveEphemeralCommand(
  text: string,
  candidates: EphemeralCommandCandidate[]
): EphemeralCommandResolution {
  const parsed = parseCommand(text);
  if(!parsed) {
    return {state: 'none'};
  }

  const uniqueCandidates = new Map<UserId, EphemeralCommandCandidate>();
  for(const candidate of candidates) {
    const existing = uniqueCandidates.get(candidate.botId);
    if(existing) {
      const commands = [...(existing.commands || [])];
      for(const command of candidate.commands || []) {
        if(!commands.some((current) => (
          current.command.toLowerCase() === command.command.toLowerCase() &&
          !!current.pFlags.ephemeral === !!command.pFlags.ephemeral
        ))) {
          commands.push(command);
        }
      }

      existing.commands = commands;
      existing.username ||= candidate.username;
      existing.available = existing.available === true || candidate.available === true ?
        true :
        existing.available === false || candidate.available === false ?
          false :
          undefined;
    } else {
      uniqueCandidates.set(candidate.botId, {
        ...candidate,
        commands: candidate.commands?.slice()
      });
    }
  }

  const matching = [...uniqueCandidates.values()].filter(({commands}) => (
    commands?.some((command) => command.command.toLowerCase() === parsed.command)
  ));
  const matchingEphemeral = matching.filter(({commands}) => (
    commands.some((command) => (
      command.command.toLowerCase() === parsed.command &&
      command.pFlags.ephemeral
    ))
  ));
  if(!matchingEphemeral.length) {
    return {state: 'none'};
  }

  if(parsed.username) {
    const matchingUsername = matching.filter(({username}) => (
      username?.toLowerCase() === parsed.username
    ));
    if(matchingUsername.length > 1) {
      return {state: 'ambiguous'};
    }

    const candidate = matchingUsername[0];
    if(candidate) {
      const ephemeral = candidate.commands.some((command) => (
        command.command.toLowerCase() === parsed.command &&
        command.pFlags.ephemeral
      ));
      if(!ephemeral) {
        return {state: 'none'};
      }

      return candidate.available === false ?
        {state: 'unavailable'} :
        {state: 'resolved', receiverId: candidate.botId};
    }

    return matchingEphemeral.some(({username}) => !username) ?
      {state: 'unavailable'} :
      {state: 'none'};
  }

  if(matching.length > 1) {
    return {state: 'ambiguous'};
  }

  const candidate = matchingEphemeral[0];
  return candidate.available === false ?
    {state: 'unavailable'} :
    {state: 'resolved', receiverId: candidate.botId};
}
