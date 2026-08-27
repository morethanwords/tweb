# tlottie WebAssembly

`tlottie.wasm` and `tlottie.nosimd.wasm` are the browser renderers from
[`dkaraush/tlottie`](https://github.com/dkaraush/tlottie), pinned to commit
[`cbfaf4fa180a74aec826ac2662e83d3ae0bbc560`](https://github.com/dkaraush/tlottie/commit/cbfaf4fa180a74aec826ac2662e83d3ae0bbc560)
([MIT](https://github.com/dkaraush/tlottie/blob/cbfaf4fa180a74aec826ac2662e83d3ae0bbc560/Cargo.toml));
the local license notice is in [`LICENSE`](./LICENSE).

Upstream builds the same sources twice — with and without
`-C target-feature=simd128`. Both variants are vendored: `lottieLoader` hands the
SIMD build to browsers that pass `IS_WEB_ASSEMBLY_SIMD_SUPPORTED` and the
`nosimd` one to the rest (Chrome 75-90, Firefox 79-88, Safari 15-16.3). They
render frame-identical output, which `src/tests/tlottieWasm.test.ts` asserts
across every bundled asset.

Apart from `simd128`, both builds need only bulk-memory, sign-extension and
non-trapping float-to-int, which is what `IS_WEB_ASSEMBLY_BASELINE_SUPPORTED`
probes before either is fetched.

The upstream web artifacts are used because tlottie does not currently publish
an npm package or a release archive. Their executable bytes match the artifacts at
<https://dkaraush.github.io/tlottie/examples/web/>. The vendoring script
removes only DWARF and symbol-name custom sections, reducing the checked-in
binaries without changing executable WebAssembly sections.

Checksums:

| artifact | upstream | stripped vendor binary |
|---|---|---|
| `tlottie.wasm` | `48e7ad6025cdae153214ea32ec4393c446475df7a3d5939d8cc286f7b9979248` | `0cb9c73e2e184d3c3d2762d4f7c23ed1c993a76a9f0c10f1ea84883a4dc41801` |
| `tlottie.nosimd.wasm` | `17bebc9128dcc3351a405a47192af7ee2c5d4653869fd76ef504c75681d242d7` | `01e0d8359073259cb6aed1a61e97ceee964419cdfecb2c8849a8deae6b6b934c` |

To reproduce them from an upstream checkout (`examples/web/build.sh` writes both):

```bash
node scripts/vendor-tlottie.mjs /path/to/tlottie/examples/web
```
