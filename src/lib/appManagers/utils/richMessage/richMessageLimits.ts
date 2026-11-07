// * what a rich message may hold when the app config says nothing: the composer's checks and the changelog's post
// * (src/scripts/changelogs.js, run by Node — so this module imports nothing)

export type RichMessageLimits = {
  lengthLimit: number,
  maxBlocks: number,
  maxDepth: number,
  maxMedia: number,
  maxTableColumns: number,
  serializedSizeLimit: number
};

export const DEFAULT_RICH_MESSAGE_LIMITS: Readonly<RichMessageLimits> = Object.freeze({
  lengthLimit: 32768,
  maxBlocks: 500,
  maxDepth: 16,
  maxMedia: 50,
  maxTableColumns: 20,
  serializedSizeLimit: 256 * 1024
});
