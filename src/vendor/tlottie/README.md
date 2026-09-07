# tlottie WebAssembly

`tlottie.wasm` and `tlottie.nosimd.wasm` are the browser renderers from
[`dkaraush/tlottie`](https://github.com/dkaraush/tlottie), pinned to commit
[`758c7cb74444f1c3c9923065c40fdb3aad8b7d60`](https://github.com/dkaraush/tlottie/commit/758c7cb74444f1c3c9923065c40fdb3aad8b7d60)
([MIT](https://github.com/dkaraush/tlottie/blob/758c7cb74444f1c3c9923065c40fdb3aad8b7d60/Cargo.toml));
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
an npm package or a release archive. The artifacts come from
[`examples/web/` at the pinned commit](https://github.com/dkaraush/tlottie/tree/758c7cb74444f1c3c9923065c40fdb3aad8b7d60/examples/web). The vendoring script
removes only DWARF and symbol-name custom sections, reducing the checked-in
binaries without changing executable WebAssembly sections.

Checksums:

| artifact | upstream | stripped vendor binary |
|---|---|---|
| `tlottie.wasm` | `adaca5c88e5df75abffc7b8bb43f145fc1dcfd0a6cf208164f3a16b1c5e998b3` | `2f3be462e448170ddf3682a0af40f527c45f03a2e3d566728001dc8909342534` |
| `tlottie.nosimd.wasm` | `1e2566386057eec9604ce4237bc220cd776b29137eb342e3e5bf70603bf270c6` | `22673f5ea917a018cdf23de9e14fc373a348d75e7f80a839bba762748ef7ed22` |

To reproduce them from an upstream checkout (`examples/web/build.sh` writes both):

```bash
node scripts/vendor-tlottie.mjs /path/to/tlottie/examples/web
```
