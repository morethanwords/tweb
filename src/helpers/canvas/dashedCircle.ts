/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export type DashedCircleSection = {
  color: CanvasFillStrokeStyles['strokeStyle'],
  length: number,
  lineWidth: number
};
export default class DashedCircle {
  public canvas: HTMLCanvasElement;
  public context: CanvasRenderingContext2D;
  public dpr: number;

  private width: number;
  private height: number;
  private centerX: number;
  private centerY: number;
  private radius: number;
  private gapLength: number;
  private totalLength: number;
  private startAngle: number;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    this.dpr = window.devicePixelRatio;
  }

  public prepare(options: {
    radius: number,
    gap: number,
    width: number,
    height: number
  }) {
    this.canvas.width = this.width = options.width * this.dpr;
    this.canvas.height = this.height = options.height * this.dpr;

    this.centerX = this.width / 2;
    this.centerY = this.height / 2;
    this.radius = options.radius * this.dpr;
    this.gapLength = options.gap * this.dpr;
    this.totalLength = Math.PI * this.radius * 2;
    // this.startAngle = -1.5 + this.gapLength * 0 / this.totalLength;
    this.startAngle = -1.5;
  }

  public render(sections: DashedCircleSection[]) {
    this.context.clearRect(0, 0, this.width, this.height);

    const totalSegments = sections.reduce((acc, section) => acc + section.length, 0);
    const totalSections = sections.length;
    this.context.lineCap = 'round';
    if(sections.length === 1 && sections[0].length === 1) {
      this.context.setLineDash([]);
    } else {
      this.context.setLineDash([this.totalLength / totalSegments - this.gapLength, this.gapLength]);
    }

    let partSum = 0;
    for(let i = 0; i < totalSections; ++i) {
      const section = sections[i];
      const part = section.length / totalSegments;
      const sectionStartAngle = this.startAngle + partSum * 2 * Math.PI;
      const sectionEndAngle = sectionStartAngle + part * 2 * Math.PI;

      this.context.beginPath();
      this.context.arc(
        this.centerX,
        this.centerY,
        this.radius,
        sectionStartAngle,
        sectionEndAngle,
        false
      );
      this.context.strokeStyle = section.color;
      this.context.lineWidth = section.lineWidth * this.dpr;
      this.context.stroke();

      partSum += part;
    }
  };
}
