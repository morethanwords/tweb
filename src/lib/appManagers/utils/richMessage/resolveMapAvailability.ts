import type {Config} from '@layer';

export default function resolveRichMessageMapAvailability(
  config: Pick<Config.config, 'static_maps_provider'>
) {
  const provider = config.static_maps_provider?.trim().toLowerCase();
  return !!provider && provider !== 'disabled' && provider !== 'none';
}
