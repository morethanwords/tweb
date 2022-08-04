/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {animate} from '../helpers/animation';
import customProperties from '../helpers/dom/customProperties';
import easeInOutSine from '../helpers/easing/easeInOutSine';
import mediaSizes from '../helpers/mediaSizes';
import roundRect from '../helpers/canvas/roundRect';

const DPR = window.devicePixelRatio;
const SIZE = 20 * DPR;
const MARGIN = 2.5 * DPR;
const WIDTH = 2 * DPR;
const RADIUS = 1 * DPR;
const LENGTH = 3;

const MIN_HEIGHT = 4;
const MAX_HEIGHT = 12;
const DURATION = 1000;

export default function groupCallActiveIcon(isActive = false) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext('2d');

  const TOTAL_WIDTH = LENGTH * WIDTH + (LENGTH - 1) * MARGIN;
  const START_X = (SIZE - TOTAL_WIDTH) / 2;

  const startTime = Date.now();
  let wasMounted = false;
  // let hadRound = false;
  const renderFrame = () => {
    if(!canvas.isConnected) {
      if(wasMounted) {
        return false;
      }
    } else if(!wasMounted) {
      wasMounted = canvas.isConnected;
    }

    const time = Date.now();
    // if(((time - startTime) / DURATION) >= 1) {
    //   hadRound = true;
    // }

    const progress = easeInOutSine((time - startTime) % DURATION, 0, 1, DURATION);

    context.clearRect(0, 0, SIZE, SIZE);
    context.fillStyle = isActive && !mediaSizes.isMobile ? customProperties.getProperty('primary-color') : '#fff';

    for(let i = 0; i < LENGTH; ++i) {
      const x = START_X + (i * WIDTH) + (i * MARGIN);

      let itemProgress: number;
      if(progress >= .5) {
        itemProgress = i % 2 ? 2 - progress * 2 : (progress - .5) * 2;
      } else {
        itemProgress = i % 2 ? progress * 2 : 1 - progress * 2;
      }

      let height = MIN_HEIGHT + (itemProgress * (MAX_HEIGHT - MIN_HEIGHT));
      /* if(!hadRound && i === 1) {
        console.log('call status animation', itemProgress, height, progress, progress >= .5);
      } */

      height *= DPR;
      const y = (SIZE - height) / 2;

      roundRect(context, x, y, WIDTH, height, RADIUS, true);
    }

    return true;
  };

  return {
    canvas,
    startAnimation: () => {
      animate(renderFrame);
      renderFrame();
    },
    setActive: (active: boolean) => {
      isActive = active;
      renderFrame();
    }
  };
}
