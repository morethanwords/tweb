import type {BotInfo, ChatFull, UserFull} from '@layer';
import SearchIndex from '@lib/searchIndex';

export default function processPeerFullForCommands(
  peerId: PeerId,
  full: ChatFull | UserFull.userFull,
  query?: string
) {
  const botInfo = 'bot_info' in full ? full.bot_info : undefined;
  const botInfos: BotInfo.botInfo[] = botInfo ?
    (Array.isArray(botInfo) ? botInfo : [botInfo]) :
    [];
  let index: SearchIndex<number>;

  if(query !== undefined) {
    index = new SearchIndex<number>({
      ignoreCase: true
    });
  }

  type T = {
    peerId: PeerId,
    name: string,
    description: string,
    index: number,
    command: string,
    ephemeral: boolean
  };
  const commands: T[] = [];
  botInfos.forEach((botInfo) => {
    if(!botInfo.commands) {
      return;
    }

    botInfo.commands.forEach(({command, description, pFlags}) => {
      const c = '/' + command;
      const commandIndex = commands.length;
      commands.push({
        peerId: botInfo.user_id ? botInfo.user_id.toPeerId(false) : peerId,
        command: command,
        name: c,
        description: description,
        index: commandIndex,
        ephemeral: !!pFlags.ephemeral
      });

      if(index) {
        index.indexObject(commandIndex, c);
      }
    });
  });

  let out: T[];
  if(!index) {
    out = commands;
  } else {
    const found = index.search(query);
    out = Array.from(found).map((commandIndex) => commands[commandIndex]);
  }

  out = out.sort((a, b) => a.index - b.index);

  return out;
}
