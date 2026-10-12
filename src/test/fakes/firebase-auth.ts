/**
 * In-memory stand-in for `firebase/auth`, aliased in place of the real module
 * by vitest.config.ts. Drive it through `fakeAuth` at the bottom.
 */

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface UserCredential {
  user: User;
}

const DEFAULT_PASSWORD = 'correct-horse';

let currentUser: User | null = null;
let listeners: ((user: User | null) => void)[] = [];
let password = DEFAULT_PASSWORD;

function emit() {
  for (const listener of [...listeners]) listener(currentUser);
}

class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export const auth = {
  get currentUser() {
    return currentUser;
  },
};

export function getAuth() {
  return auth;
}

export function connectAuthEmulator() {
  /* no-op */
}

export function onAuthStateChanged(_auth: unknown, callback: (user: User | null) => void) {
  listeners.push(callback);
  callback(currentUser);
  return () => {
    listeners = listeners.filter((candidate) => candidate !== callback);
  };
}

export async function signInWithEmailAndPassword(
  _auth: unknown,
  email: string,
  attempted: string
): Promise<UserCredential> {
  if (attempted !== password) {
    throw new AuthError('auth/wrong-password', 'The password is invalid.');
  }
  currentUser = { uid: 'test-uid', email, displayName: currentUser?.displayName ?? null };
  emit();
  return { user: currentUser };
}

export async function createUserWithEmailAndPassword(
  _auth: unknown,
  email: string,
  newPassword: string
): Promise<UserCredential> {
  password = newPassword;
  currentUser = { uid: 'test-uid', email, displayName: null };
  emit();
  return { user: currentUser };
}

export async function signOut(): Promise<void> {
  currentUser = null;
  emit();
}

export async function updateProfile(
  user: User,
  { displayName }: { displayName?: string | null }
): Promise<void> {
  if (displayName !== undefined) {
    user.displayName = displayName;
    if (currentUser && currentUser.uid === user.uid) currentUser.displayName = displayName;
  }
}

export async function updatePassword(_user: User, newPassword: string): Promise<void> {
  password = newPassword;
}

export async function reauthenticateWithCredential(
  _user: User,
  credential: { password: string }
): Promise<void> {
  if (credential.password !== password) {
    throw new AuthError('auth/wrong-password', 'The password is invalid.');
  }
}

export async function deleteUser(): Promise<void> {
  currentUser = null;
  emit();
}

export const EmailAuthProvider = {
  credential: (email: string, pw: string) => ({ email, password: pw }),
};

/** Test-facing control surface. */
export const fakeAuth = {
  reset() {
    currentUser = null;
    listeners = [];
    password = DEFAULT_PASSWORD;
  },
  /** Put a signed-in user in place before rendering. */
  signIn(user: Partial<User> = {}) {
    currentUser = {
      uid: 'test-uid',
      email: 'test@example.com',
      displayName: 'Test User',
      ...user,
    };
    emit();
    return currentUser;
  },
  password: DEFAULT_PASSWORD,
  current: () => currentUser,
  listenerCount: () => listeners.length,
};
