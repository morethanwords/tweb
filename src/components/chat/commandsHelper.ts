import { BotCommand } from "../../layer";
import RichTextProcessor from "../../lib/richtextprocessor";
import AvatarElement from "../avatar";
import Scrollable from "../scrollable";
import AutocompleteHelper from "./autocompleteHelper";

export default class CommandsHelper extends AutocompleteHelper {
  private scrollable: Scrollable;

  constructor(appendTo: HTMLElement) {
    super(appendTo, 'y', (target) => {
      
    });

    this.container.classList.add('commands-helper');
  }

  private init() {
    this.list = document.createElement('div');
    this.list.classList.add('commands-helper-commands');

    this.container.append(this.list);

    this.scrollable = new Scrollable(this.container);

    this.addEventListener('visible', () => {
      setTimeout(() => { // it is not rendered yet
        this.scrollable.container.scrollTop = 0;
      }, 0);
    });
  }

  public renderCommands(commands: {userId: number, command: BotCommand}[]) {
    if(this.init) {
      if(!commands.length) {
        return;
      }

      this.init();
      this.init = null;
    }

    if(commands.length) {
      this.list.innerHTML = '';
      commands.forEach(command => {
        const div = document.createElement('div');
        div.classList.add('commands-helper-command');

        const avatar = new AvatarElement();
        avatar.classList.add('avatar-30');
        avatar.setAttribute('dialog', '0');
        avatar.setAttribute('peer', '' + command.userId);

        const name = document.createElement('div');
        name.classList.add('commands-helper-command-name');
        name.innerText = '/' + command.command.command;

        const description = document.createElement('div');
        description.classList.add('commands-helper-command-description');
        description.innerHTML = RichTextProcessor.wrapEmojiText(command.command.description);

        div.append(avatar, name, description);
        this.list.append(div);
      });
    }

    this.toggle(!commands.length);
  }
}
