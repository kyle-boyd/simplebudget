/**
 * Stands in for `@/lib/firebase` (which would otherwise call initializeApp and
 * reach for emulators). Re-exports the fakes so the app and the tests share one
 * store.
 */
export { auth } from './firebase-auth';

export const db = {};

export default {};
