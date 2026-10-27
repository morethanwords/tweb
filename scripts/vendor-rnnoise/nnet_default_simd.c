/* nnet_default.c with the int8 matrix kernels of vec.h swapped for the
 * WebAssembly SIMD ones in vec_wasm_simd.h; everything else is upstream. */
#define cgemv8x4 rnn_generic_cgemv8x4
#define sparse_cgemv8x4 rnn_generic_sparse_cgemv8x4
#include "vec.h"
#undef cgemv8x4
#undef sparse_cgemv8x4
#include "vec_wasm_simd.h"
#include "nnet_default.c"
