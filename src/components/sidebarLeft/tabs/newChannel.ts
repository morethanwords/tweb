import appSidebarLeft, { AppSidebarLeft } from "..";
import { InputFile } from "../../../layer";
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import Button from "../../button";
import InputField from "../../inputField";
import PopupAvatar from "../../popups/avatar";
import { SliderTab } from "../../slider";

export default class AppNewChannelTab implements SliderTab {
  private container = document.querySelector('.new-channel-container') as HTMLDivElement;
  private canvas = this.container.querySelector('.avatar-edit-canvas') as HTMLCanvasElement;
  private uploadAvatar: () => Promise<InputFile> = null;

  private channelNameInputField: InputField;
  private channelDescriptionInputField: InputField;
  private nextBtn: HTMLButtonElement;

  constructor() {
    const content = this.container.querySelector('.sidebar-content');

    this.container.querySelector('.avatar-edit').addEventListener('click', () => {
      new PopupAvatar().open(this.canvas, (_upload) => {
        this.uploadAvatar = _upload;
      });
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    this.channelNameInputField = new InputField({
      label: 'Channel Name',
      maxLength: 128
    });

    this.channelDescriptionInputField = new InputField({
      label: 'Description (optional)',
      maxLength: 255
    });

    inputWrapper.append(this.channelNameInputField.container, this.channelDescriptionInputField.container);

    const onLengthChange = () => {
      this.nextBtn.classList.toggle('is-visible', !!this.channelNameInputField.value.length && 
        !this.channelNameInputField.input.classList.contains('error') && 
        !this.channelDescriptionInputField.input.classList.contains('error'));
    };

    this.channelNameInputField.input.addEventListener('input', onLengthChange);
    this.channelDescriptionInputField.input.addEventListener('input', onLengthChange);

    const caption = document.createElement('div');
    caption.classList.add('caption');
    caption.innerText = 'You can provide an optional description for your channel.';

    this.nextBtn = Button('btn-corner btn-circle', {icon: 'next'});

    content.append(inputWrapper, caption, this.nextBtn);

    this.nextBtn.addEventListener('click', () => {
      const title = this.channelNameInputField.value;
      const about = this.channelDescriptionInputField.value;

      this.nextBtn.disabled = true;
      appChatsManager.createChannel(title, about).then((channelId) => {
        if(this.uploadAvatar) {
          this.uploadAvatar().then((inputFile) => {
            appChatsManager.editPhoto(channelId, inputFile);
          });
        }
        
        appSidebarLeft.removeTabFromHistory(AppSidebarLeft.SLIDERITEMSIDS.newChannel);
        appSidebarLeft.addMembersTab.init(channelId, 'channel', true);
      });
    });
  }

  public onCloseAfterTimeout() {
    let ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.uploadAvatar = null;
    this.channelNameInputField.value = '';
    this.channelDescriptionInputField.value = '';
    this.nextBtn.disabled = false;
  }
}