import IS_WEB_ASSEMBLY_SUPPORTED from '@environment/webAssemblySupport';

// Feature probes are minimal modules built from the opcodes they test for.
// validate() stays synchronous and does not compile or execute application code.
export default function isWebAssemblyFeatureSupported(testModule: BufferSource) {
  return IS_WEB_ASSEMBLY_SUPPORTED &&
    typeof(WebAssembly.validate) === 'function' &&
    WebAssembly.validate(testModule);
}
