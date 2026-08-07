import UsernamesSection from '@components/usernamesSection';

export default function UsernamesSectionTsx(
  props: ConstructorParameters<typeof UsernamesSection>[0]
) {
  return new UsernamesSection(props).container;
}
