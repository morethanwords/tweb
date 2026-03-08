// Evaluated lazily so that test setup files can install self.crypto before first use.
const getSubtle = (): SubtleCrypto =>
  typeof(window) !== 'undefined' && window.crypto?.subtle ? window.crypto.subtle : self.crypto.subtle;

const subtle: SubtleCrypto = new Proxy({} as SubtleCrypto, {
  get(_target, prop: keyof SubtleCrypto) {
    return (...args: any[]) => (getSubtle()[prop] as Function)(...args);
  }
});

export default subtle;
