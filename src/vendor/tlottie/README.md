# tlottie WebAssembly

`tlottie.wasm` is the browser renderer from
[`dkaraush/tlottie`](https://github.com/dkaraush/tlottie), pinned to commit
[`44520df07af83396cbea5e85c4c268ec34ad5b06`](https://github.com/dkaraush/tlottie/commit/44520df07af83396cbea5e85c4c268ec34ad5b06)
([MIT](https://github.com/dkaraush/tlottie/blob/44520df07af83396cbea5e85c4c268ec34ad5b06/Cargo.toml));
the local license notice is in [`LICENSE`](./LICENSE).

The upstream demo artifact is used because tlottie does not currently publish
an npm package or a release archive. Its executable bytes match the artifact at
<https://dkaraush.github.io/tlottie/demo/tlottie.wasm>. The vendoring script
removes only DWARF and symbol-name custom sections, reducing the checked-in
binary without changing executable WebAssembly sections. Like the demo, this
build intentionally requires WebAssembly `simd128`.

Checksums:

- upstream demo: `6f0257f8b59afc1399e0697c160ff2cc2a136e8776447f6c0abd5c240f56c646`
- stripped vendor binary: `877b8c8c36156710842241101dec5f2f74ba40660ffcfab8f2858deabd7e3523`

To reproduce it from an upstream checkout:

```bash
node scripts/vendor-tlottie.mjs /path/to/tlottie/demo/tlottie.wasm
```
