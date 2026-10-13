/* WebAssembly SIMD versions of RNNoise's int8 matrix-vector kernels
 * (cgemv8x4, sparse_cgemv8x4 in vec.h): the same 8x4 weight blocks and the
 * same 8-bit input quantization, accumulated exactly in 32-bit integers with
 * i32x4.dot_i16x8_s instead of one float multiply per weight. */
#ifndef VEC_WASM_SIMD_H
#define VEC_WASM_SIMD_H

#include <math.h>
#include <wasm_simd128.h>
#include "opus_types.h"

static inline void wasm_quantize_inputs(opus_int16 *x, const float *_x, int cols)
{
   int i;
   for (i=0;i<cols;i++) x[i] = (int)floor(.5+127*_x[i]);
}

/* acc[0..3] hold, per pair of rows, the two half-sums of each row. */
static inline void wasm_block8x4(v128_t *acc, const opus_int8 *w, const opus_int16 *x)
{
   v128_t xv = wasm_v128_load64_splat(x);
   v128_t w0 = wasm_v128_load(w);
   v128_t w1 = wasm_v128_load(w + 16);
   acc[0] = wasm_i32x4_add(acc[0], wasm_i32x4_dot_i16x8(wasm_i16x8_extend_low_i8x16(w0), xv));
   acc[1] = wasm_i32x4_add(acc[1], wasm_i32x4_dot_i16x8(wasm_i16x8_extend_high_i8x16(w0), xv));
   acc[2] = wasm_i32x4_add(acc[2], wasm_i32x4_dot_i16x8(wasm_i16x8_extend_low_i8x16(w1), xv));
   acc[3] = wasm_i32x4_add(acc[3], wasm_i32x4_dot_i16x8(wasm_i16x8_extend_high_i8x16(w1), xv));
}

static inline void wasm_store8(float *out, const v128_t *acc, const float *scale)
{
   v128_t lo = wasm_i32x4_add(wasm_i32x4_shuffle(acc[0], acc[1], 0, 2, 4, 6), wasm_i32x4_shuffle(acc[0], acc[1], 1, 3, 5, 7));
   v128_t hi = wasm_i32x4_add(wasm_i32x4_shuffle(acc[2], acc[3], 0, 2, 4, 6), wasm_i32x4_shuffle(acc[2], acc[3], 1, 3, 5, 7));
   wasm_v128_store(out, wasm_f32x4_mul(wasm_f32x4_convert_i32x4(lo), wasm_v128_load(scale)));
   wasm_v128_store(out + 4, wasm_f32x4_mul(wasm_f32x4_convert_i32x4(hi), wasm_v128_load(scale + 4)));
}

static inline void sparse_cgemv8x4(float *out, const opus_int8 *w, const int *idx, const float *scale, int rows, int cols, const float *_x)
{
   int i, j;
   opus_int16 x[MAX_INPUTS];
   wasm_quantize_inputs(x, _x, cols);
   for (i=0;i<rows;i+=8)
   {
      v128_t acc[4] = {wasm_i32x4_splat(0), wasm_i32x4_splat(0), wasm_i32x4_splat(0), wasm_i32x4_splat(0)};
      int colblocks = *idx++;
      for (j=0;j<colblocks;j++)
      {
         wasm_block8x4(acc, w, &x[*idx++]);
         w += 32;
      }
      wasm_store8(&out[i], acc, &scale[i]);
   }
}

static inline void cgemv8x4(float *out, const opus_int8 *w, const float *scale, int rows, int cols, const float *_x)
{
   int i, j;
   opus_int16 x[MAX_INPUTS];
   wasm_quantize_inputs(x, _x, cols);
   for (i=0;i<rows;i+=8)
   {
      v128_t acc[4] = {wasm_i32x4_splat(0), wasm_i32x4_splat(0), wasm_i32x4_splat(0), wasm_i32x4_splat(0)};
      for (j=0;j<cols;j+=4)
      {
         wasm_block8x4(acc, w, &x[j]);
         w += 32;
      }
      wasm_store8(&out[i], acc, &scale[i]);
   }
}

#endif
