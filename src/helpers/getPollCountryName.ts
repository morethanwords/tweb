import I18n from '@lib/langPack';

export default function getPollCountryName(iso2: string) {
  if(iso2?.toUpperCase() === 'FT') return 'Fragment';

  const country = I18n.countriesList.find((item) => item.iso2.toLowerCase() === iso2?.toLowerCase());
  return country ? I18n.format(country.default_name as any, true) : iso2;
}
