/** The columns of the main window, in the order a narrow screen slides through them (appImManager.selectTab). */
export enum APP_TABS {
  CHATLIST,
  CHAT,
  PROFILE
}

/** On the body while the left column (the chat list) is open over the chat, on narrow screens */
export const LEFT_COLUMN_ACTIVE_CLASSNAME = 'is-left-column-shown';
/** On the body while the right column (profile, shared media, ...) is shown */
export const RIGHT_COLUMN_ACTIVE_CLASSNAME = 'is-right-column-shown';
