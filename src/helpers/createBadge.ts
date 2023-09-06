export default function createBadge(tag: 'span' | 'div', size: number, color: string) {
  const badge = document.createElement(tag);
  badge.className = `badge badge-${size} badge-${color} is-badge-empty`;
  return badge;
}
