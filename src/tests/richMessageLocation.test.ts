import resolveRichMessageMapAvailability from '@appManagers/utils/richMessage/resolveMapAvailability';
import {
  composeRichMessageMapCaption,
  normalizeRichMessageMapCenter,
  panRichMessageMapCenter,
  splitRichMessageMapCaption
} from '@components/popups/richMessageLocationModel';

describe('rich-message location picker model', () => {
  test('matches the tdesktop title and address caption contract', () => {
    expect(composeRichMessageMapCaption('Museum', 'Main Street')).toBe(
      'Museum\nMain Street'
    );
    expect(composeRichMessageMapCaption('', 'Main Street')).toBe('Main Street');
    expect(composeRichMessageMapCaption('Museum', '')).toBe('Museum');
    expect(splitRichMessageMapCaption('Museum\nMain Street\nDubai')).toEqual({
      address: 'Main Street\nDubai',
      title: 'Museum'
    });
  });

  test('pans in Web Mercator space and keeps coordinates valid', () => {
    const east = panRichMessageMapCenter(
      {latitude: 0, longitude: 0},
      256,
      0,
      1
    );
    expect(east.latitude).toBeCloseTo(0);
    expect(east.longitude).toBeCloseTo(-180);

    const south = panRichMessageMapCenter(
      {latitude: 0, longitude: 0},
      0,
      128,
      1
    );
    expect(south.latitude).toBeLessThan(0);
    expect(normalizeRichMessageMapCenter({
      latitude: 100,
      longitude: 540
    })).toEqual({
      latitude: 85.05112878,
      longitude: -180
    });
  });

  test('requires an available static-map provider', () => {
    expect(resolveRichMessageMapAvailability({
      static_maps_provider: 'google'
    })).toBe(true);
    expect(resolveRichMessageMapAvailability({})).toBe(false);
    expect(resolveRichMessageMapAvailability({
      static_maps_provider: 'disabled'
    })).toBe(false);
  });
});
