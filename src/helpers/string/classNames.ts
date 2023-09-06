export default function classNames(...args: string[]) {
  return args.filter(Boolean).join(' ');
}
