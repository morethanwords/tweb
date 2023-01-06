/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function applyMixins(derivedCtor: any, constructors: any[]) {
  // const callbacks: Array<(...args: any[]) => any> = [];

  constructors.forEach((baseCtor) => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
      const value: PropertyDescriptor = Object.getOwnPropertyDescriptor(baseCtor.prototype, name) || Object.create(null);
      /* if(name === '_constructor') {
        callbacks.push(value.value);
        return;
      } else  */if(name === 'constructor') {
        return;
      }

      Object.defineProperty(
        derivedCtor.prototype,
        name,
        value
      );
    });
  });

  // if(callbacks.length) {
  //   function c(...args: any[]): any {
  //     callbacks.forEach((cb, idx) => {
  //       // @ts-ignore
  //       cb.apply(this, args[idx] || []);
  //     });
  //   };

  //   Object.defineProperty(derivedCtor.prototype, 'superConstructor', {
  //     configurable: true,
  //     enumerable: true,
  //     value: c,
  //     writable: true
  //   });
  // }
}
