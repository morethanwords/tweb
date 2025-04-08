import {HlsStandardResolutionHeight} from './types';

export function snapQualityHeight(height: number) {
  const standardHeights: HlsStandardResolutionHeight[] = [480, 720, 1080];

  const threshold1 = (standardHeights[1] - standardHeights[0]) / 2;
  if(height < standardHeights[0] + threshold1) return standardHeights[0];

  const threshold2 = (standardHeights[2] - standardHeights[1]) / 2;
  if(height < standardHeights[1] + threshold2) return standardHeights[1];

  return standardHeights[2];
}
