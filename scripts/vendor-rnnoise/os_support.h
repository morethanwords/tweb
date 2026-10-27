/* The generic (neither x86 nor NEON) path of RNNoise's vec.h includes Opus's
 * os_support.h, which RNNoise does not ship. These are the only macros it uses. */
#ifndef OS_SUPPORT_H
#define OS_SUPPORT_H
#include <string.h>
#define OPUS_CLEAR(dst, n) (memset((dst), 0, (n)*sizeof(*(dst))))
#define OPUS_COPY(dst, src, n) (memcpy((dst), (src), (n)*sizeof(*(dst)) + 0*((dst)-(src))))
#define OPUS_MOVE(dst, src, n) (memmove((dst), (src), (n)*sizeof(*(dst)) + 0*((dst)-(src))))
#endif
