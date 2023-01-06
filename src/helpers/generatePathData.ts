/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// generate a path's arc data parameter

import {MOUNT_CLASS_TO} from '../config/debug';

// http://www.w3.org/TR/SVG/paths.html#PathDataEllipticalArcCommands
function arcParameter(rx: number, ry: number, xAxisRotation: number, largeArcFlag: number, sweepFlag: number, x: number, y: number) {
  return [rx, ',', ry, ' ',
    xAxisRotation, ' ',
    largeArcFlag, ',',
    sweepFlag, ' ',
    x, ',', y].join('');
}

export default function generatePathData(x: number, y: number, width: number, height: number, tl: number, tr: number, br: number, bl: number) {
  const data: string[] = [];

  // start point in top-middle of the rectangle
  data.push('M' + (x + width / 2) + ',' + y);

  // next we go to the right
  data.push('H' + (x + width - tr));

  if(tr > 0) {
    // now we draw the arc in the top-right corner
    data.push('A' + arcParameter(tr, tr, 0, 0, 1, (x + width), (y + tr)));
  }

  // next we go down
  data.push('V' + (y + height - br));

  if(br > 0) {
    // now we draw the arc in the lower-right corner
    data.push('A' + arcParameter(br, br, 0, 0, 1, (x + width - br), (y + height)));
  }

  // now we go to the left
  data.push('H' + (x + bl));

  if(bl > 0) {
    // now we draw the arc in the lower-left corner
    data.push('A' + arcParameter(bl, bl, 0, 0, 1, (x + 0), (y + height - bl)));
  }

  // next we go up
  data.push('V' + (y + tl));

  if(tl > 0) {
    // now we draw the arc in the top-left corner
    data.push('A' + arcParameter(tl, tl, 0, 0, 1, (x + tl), (y + 0)));
  }

  // and we close the path
  data.push('Z');

  return data.join(' ');
}

MOUNT_CLASS_TO.generatePathData = generatePathData;
