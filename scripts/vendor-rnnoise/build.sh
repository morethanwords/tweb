#!/bin/sh
#
# Rebuilds src/vendor/rnnoise from pinned sources (see its README.md):
#   - rnnoise.wasm, rnnoise.nosimd.wasm: RNNoise's code, without a model
#     (USE_WEIGHTS_FILE), built with wasi-sdk WASI_SDK_VERSION;
#   - weights.bin: the model of the same release as an RNNoise weight blob,
#     which the code loads at run time (rnnoise_model_from_buffer) — another
#     model of the same architecture needs no rebuild.
# Inputs: the RNNoise RNNOISE_VERSION release tarball, which carries its model
# (checked against RNNOISE_SHA256); wasi-sdk (checked against WASI_SDK_SHA256);
# the three files next to this script: os_support.h (a header RNNoise's
# generic code path includes but does not ship), and the WebAssembly SIMD int8
# matrix kernels the SIMD build swaps in (vec_wasm_simd.h, nnet_default_simd.c).
#
# usage: sh scripts/vendor-rnnoise/build.sh [work dir]   (Linux x86_64, gcc)
set -eu

RNNOISE_VERSION=0.2
RNNOISE_SHA256=90fce4b00b9ff24c08dbfe31b82ffd43bae383d85c5535676d28b0a2b11c0d37
WASI_SDK_VERSION=34
WASI_SDK_SHA256=b761e3a0721dbae9c09a0059e5fdb2bf917d1b4a8a7b430fb3b5aafb0984b2c4

HERE=$(cd "$(dirname "$0")" && pwd)
VENDOR=$(cd "$HERE/../../src/vendor/rnnoise" && pwd)
WORK=${1:-${TMPDIR:-/tmp}/vendor-rnnoise}
mkdir -p "$WORK"
cd "$WORK"

SDK=wasi-sdk-$WASI_SDK_VERSION.0-x86_64-linux
if [ ! -d "$SDK" ]; then
  curl -fsSL -o wasi-sdk.tar.gz "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-$WASI_SDK_VERSION/$SDK.tar.gz"
  echo "$WASI_SDK_SHA256  wasi-sdk.tar.gz" | sha256sum -c -
  tar -xzf wasi-sdk.tar.gz
fi

RNNOISE=rnnoise-$RNNOISE_VERSION
if [ ! -d "$RNNOISE" ]; then
  curl -fsSL -o rnnoise.tar.gz "https://github.com/xiph/rnnoise/releases/download/v$RNNOISE_VERSION/$RNNOISE.tar.gz"
  echo "$RNNOISE_SHA256  rnnoise.tar.gz" | sha256sum -c -
  tar -xzf rnnoise.tar.gz
fi

R=$RNNOISE/src
build() {
  output=$1
  shift
  "$SDK/bin/clang" --target=wasm32-wasip1 --sysroot="$SDK/share/wasi-sysroot" -O3 \
    -mcpu=mvp -mbulk-memory -msign-ext -mnontrapping-fptoint "$@" \
    -I"$HERE" -I"$RNNOISE/include" -I"$R" -DDISABLE_DEBUG_FLOAT -DUSE_WEIGHTS_FILE -w \
    -mexec-model=reactor -Wl,--no-entry -Wl,--gc-sections -Wl,--strip-all \
    -Wl,-z,stack-size=1048576 \
    -Wl,--export=rnnoise_model_from_buffer \
    -Wl,--export=rnnoise_create -Wl,--export=rnnoise_destroy \
    -Wl,--export=rnnoise_process_frame -Wl,--export=rnnoise_get_frame_size \
    -Wl,--export=malloc -Wl,--export=free \
    "$R/denoise.c" "$R/rnn.c" "$R/pitch.c" "$R/kiss_fft.c" "$R/celt_lpc.c" "$R/nnet.c" \
    "$R/parse_lpcnet_weights.c" "$R/rnnoise_data.c" "$R/rnnoise_tables.c" \
    -o "$VENDOR/$output"
}

build rnnoise.wasm -msimd128 "$HERE/nnet_default_simd.c"
build rnnoise.nosimd.wasm "$R/nnet_default.c"

# The release's model as a weight blob, without the float copies of its int8
# layers that the runtime does not read.
gcc -O1 -DDISABLE_DEBUG_FLOAT -I"$RNNOISE/include" -I"$R" "$R/write_weights.c" "$R/parse_lpcnet_weights.c" -lm -o write_weights
./write_weights
mv weights_blob.bin "$VENDOR/weights.bin"

cp "$RNNOISE/COPYING" "$VENDOR/LICENSE"
sha256sum "$VENDOR/rnnoise.wasm" "$VENDOR/rnnoise.nosimd.wasm" "$VENDOR/weights.bin"
