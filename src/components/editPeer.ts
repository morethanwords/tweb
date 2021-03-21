import { InputFile } from "../layer";
import AvatarEdit from "./avatarEdit";
import AvatarElement from "./avatar";
import InputField from "./inputField";
import ListenerSetter from "../helpers/listenerSetter";
import Button from "./button";
import { safeAssign } from "../helpers/object";

export default class EditPeer {
  public nextBtn: HTMLButtonElement;

  public uploadAvatar: () => Promise<InputFile>;
  public avatarEdit: AvatarEdit;
  public avatarElem: AvatarElement;

  private inputFields: InputField[];
  private listenerSetter: ListenerSetter;

  private peerId: number;

  constructor(options: {
    peerId: number,
    inputFields: EditPeer['inputFields'],
    listenerSetter: ListenerSetter,
    doNotEditAvatar?: boolean,
  }) {
    safeAssign(this, options);

    this.nextBtn = Button('btn-circle btn-corner tgico-check');

    this.avatarElem = document.createElement('avatar-element') as AvatarElement;
    this.avatarElem.classList.add('avatar-placeholder', 'avatar-120');
    this.avatarElem.setAttribute('peer', '' + this.peerId);

    if(!options.doNotEditAvatar) {
      this.avatarEdit = new AvatarEdit((_upload) => {
        this.uploadAvatar = _upload;
        this.handleChange();
        this.avatarElem.remove();
      });

      this.avatarEdit.container.append(this.avatarElem);
    }

    this.inputFields.forEach(inputField => {
      this.listenerSetter.add(inputField.input, 'input', this.handleChange);
    });
  }

  public isChanged = () => {
    return !!this.uploadAvatar || !!this.inputFields.find(inputField => inputField.isValid());
  };

  public handleChange = () => {
    this.nextBtn.classList.toggle('is-visible', this.isChanged());
  };
}
