// ! `path_full` is whatever the frame put in a `web_app_open_tg_link` event, so it cannot be pasted
// ! onto the bare host — a value that does not start with a slash lands in the host instead of the
// ! path ('.evil.com/x' would build https://t.me.evil.com/x)
export default function getWebViewTgLink(pathFull: string) {
  return 'https://t.me/' + (pathFull || '').replace(/^\/+/, '');
}
