import InputField from "../inputField";

export default interface Monkey {
  attachToInputField: (inputField: InputField) => void;
}
