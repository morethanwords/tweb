export default function safeWindowOpen(url: string) {
  window.open(url, '_blank', 'noreferrer');
}
