import { SliderSuperTab } from "../../slider"
import InputField from "../../inputField";
import EditPeer from "../../editPeer";
import { SettingSection } from "../../sidebarLeft";

export default class AppEditGroupTab extends SliderSuperTab {
  private groupNameInputField: InputField;
  private descriptionInputField: InputField;
  private editPeer: EditPeer;

  protected init() {
    this.container.classList.add('edit-peer-container', 'edit-group-container');
    this.title.innerHTML = 'Edit';

    {
      const section = new SettingSection({noDelimiter: true});
      const inputFields: InputField[] = [];

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');
  
      this.groupNameInputField = new InputField({
        label: 'Group Name',
        name: 'group-name',
        maxLength: 255
      });
      this.descriptionInputField = new InputField({
        label: 'Description',
        name: 'group-description',
        maxLength: 255
      });
  
      inputWrapper.append(this.groupNameInputField.container, this.descriptionInputField.container);
      
      inputFields.push(this.groupNameInputField, this.descriptionInputField);

      this.editPeer = new EditPeer({
        peerId: -1408712018,
        inputFields,
        listenerSetter: this.listenerSetter
      });
      this.content.append(this.editPeer.nextBtn);

      section.content.append(this.editPeer.avatarEdit.container, inputWrapper);

      this.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({

      });
    }

    {
      const section = new SettingSection({
        
      });
    }
  }
}
