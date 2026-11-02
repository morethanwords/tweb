// * free of imports: the preview's Vite config seeds a session with it too (vite.preview.config.ts)

/** The DC whose auth key an account's state is kept under (App.baseDcId): a new key there drops the state */
export const BASE_DC_ID = 2;

/** What the account's slot and the state's check keep of that key, as `auth_key_fingerprint` */
export default function getAuthKeyFingerprint(authKey: string) {
  return authKey.slice(0, 8);
}
