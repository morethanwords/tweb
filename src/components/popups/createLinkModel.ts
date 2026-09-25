export type CreateLinkPopupOptions = {
  editing?: boolean,
  text?: string,
  url?: string
};

export type CreateLinkSelection = {
  text: string,
  url: string
};

export function getCreateLinkPopupOptionsForSelection(
  selectedLink: CreateLinkSelection | undefined,
  selectedText: string
): CreateLinkPopupOptions {
  return {
    editing: !!selectedLink,
    text: selectedLink?.text ?? selectedText,
    url: selectedLink?.url ?? ''
  };
}
