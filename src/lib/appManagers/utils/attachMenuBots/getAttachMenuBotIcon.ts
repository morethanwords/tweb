import {AttachMenuBot} from '../../../../layer';
import {ATTACH_MENU_BOT_ICON_NAME} from '../../../mtproto/mtproto_config';

export default function getAttachMenuBotIcon(attachMenuBot: AttachMenuBot) {
  return attachMenuBot.icons.find((icon) => icon.name === ATTACH_MENU_BOT_ICON_NAME);
}
