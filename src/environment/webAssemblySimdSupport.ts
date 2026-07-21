import IS_WEB_ASSEMBLY_SUPPORTED from '@environment/webAssemblySupport';

// A minimal module returning v128 and using SIMD opcodes. validate() stays
// synchronous and does not compile or execute application code.
const SIMD_TEST_MODULE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0xfd, 0x62, 0x0b
]);

const IS_WEB_ASSEMBLY_SIMD_SUPPORTED = IS_WEB_ASSEMBLY_SUPPORTED &&
  typeof(WebAssembly.validate) === 'function' &&
  WebAssembly.validate(SIMD_TEST_MODULE);

export default IS_WEB_ASSEMBLY_SIMD_SUPPORTED;
