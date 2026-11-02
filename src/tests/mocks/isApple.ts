/**
 * `IS_APPLE` as a test sets it: `appleEnv.isApple = true` for a Mac, false by default (jsdom's user agent is
 * no Apple's); the rest of `@environment/userAgent` stays as it is. Import it before what reads the flag.
 */
export const appleEnv = {isApple: false};

vi.mock('@environment/userAgent', async(importOriginal) => {
  const actual = await importOriginal<typeof import('@environment/userAgent')>();
  return {...actual, get IS_APPLE() {
    return appleEnv.isApple;
  }};
});
