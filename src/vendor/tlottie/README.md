# tlottie WebAssembly

`tlottie.wasm` is the browser renderer from
[`dkaraush/tlottie`](https://github.com/dkaraush/tlottie), pinned to commit
[`8efaf11d2113e5d2d0ef0a8b0b710703d296c153`](https://github.com/dkaraush/tlottie/commit/8efaf11d2113e5d2d0ef0a8b0b710703d296c153)
([MIT](https://github.com/dkaraush/tlottie/blob/8efaf11d2113e5d2d0ef0a8b0b710703d296c153/Cargo.toml));
the local license notice is in [`LICENSE`](./LICENSE).

The upstream web artifact is used because tlottie does not currently publish
an npm package or a release archive. Its executable bytes match the artifact at
<https://dkaraush.github.io/tlottie/examples/web/tlottie.wasm>. The vendoring script
removes only DWARF and symbol-name custom sections, reducing the checked-in
binary without changing executable WebAssembly sections. Like the upstream artifact, this
build intentionally requires WebAssembly `simd128`.

Checksums:

- upstream web artifact: `60f37ce619fac19905b760efce96195c7f4c683b2bca7f85777a8825ab613e19`
- stripped vendor binary: `1d959e0e5efccd470c1a1ce79bcacc066cfa38499237955b0ec382d00245f8ec`

To reproduce it from an upstream checkout:

```bash
node scripts/vendor-tlottie.mjs /path/to/tlottie/examples/web/tlottie.wasm
```
