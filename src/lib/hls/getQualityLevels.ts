import {Document} from '@layer';
import {getQualityFilesEntries} from '@lib/hls/createHlsVideoSource';
import {snapQualityHeight} from '@lib/hls/snapQualityHeight';

/**
 * The qualities a video is offered in: one file per standard height, the lightest of its height,
 * tallest first.
 */
export default function getQualityLevels(altDocs: Document.document[]) {
  const entries = getQualityFilesEntries(altDocs);
  const heights = Array.from(new Set(entries.map((entry) => snapQualityHeight(entry.h))))
  .sort((a, b) => b - a);

  return heights.map((height) => {
    let chosen: (typeof entries)[number];
    for(const entry of entries) {
      if(snapQualityHeight(entry.h) !== height) continue;
      if(!chosen || entry.bandwidth < chosen.bandwidth) chosen = entry;
    }

    return chosen;
  });
}

// * a video offered in more than one quality plays over HLS, which picks among them as it goes
export function playsOverHls(levels: ReturnType<typeof getQualityLevels>) {
  return levels.length > 1;
}
