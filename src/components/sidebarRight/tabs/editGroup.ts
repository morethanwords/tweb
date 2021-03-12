import { SliderSuperTab } from "../../slider"
import InputField from "../../inputField";
import EditPeer from "../../editPeer";

export default class AppEditGroupTab extends SliderSuperTab {
  private groupNameInputField: InputField;
  private descriptionInputField: InputField;
  private editPeer: EditPeer;

  protected init() {
    this.container.classList.add('edit-peer-container', 'edit-group-container');
    this.title.innerHTML = 'Edit';

    const inputFields: InputField[] = [];

    {
      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');
  
      this.groupNameInputField = new InputField({
        label: 'Group Name',
        name: 'group-name',
        maxLength: 70
      });
      this.descriptionInputField = new InputField({
        label: 'Description',
        name: 'group-description',
        maxLength: 64
      });
  
      inputWrapper.append(this.groupNameInputField.container, this.descriptionInputField.container);
      
      inputFields.push(this.groupNameInputField, this.descriptionInputField);
      this.scrollable.append(inputWrapper);
    }

    this.editPeer = new EditPeer({
      peerId: -1408712018,
      inputFields,
      listenerSetter: this.listenerSetter
    });
    this.content.append(this.editPeer.nextBtn);
    this.scrollable.prepend(this.editPeer.avatarEdit.container);
  }
}
