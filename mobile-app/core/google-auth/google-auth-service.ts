// IMPORTANT: never statically `import` from '@react-native-google-signin/google-signin'
// at module scope. Its native binding module calls
// TurboModuleRegistry.getEnforcing('RNGoogleSignin') at import time (not on
// first use), which throws synchronously in any environment that doesn't
// have the native module compiled in - Expo Go above all. Since this
// service is reachable from the Settings screen (always mounted, part of
// the tab bar), a static import here would crash that whole screen for
// every user running Expo Go, not just whoever taps "Connect". Every
// access below goes through a lazily-required, memoized handle instead.
import type {
  GoogleSignin as GoogleSigninType,
  User,
} from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

const GOOGLE_WEB_CLIENT_ID = Constants.expoConfig?.extra?.googleWebClientId as string;
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Thrown when the native Google Sign-In module isn't available in this build (e.g. Expo Go). */
export class GoogleSignInUnavailableError extends Error {
  constructor() {
    super(
      'O login com Google não está disponível nesta versão do app. É necessário um build nativo (APK/development build).',
    );
    this.name = 'GoogleSignInUnavailableError';
  }
}

let cachedModule: typeof GoogleSigninType | null | undefined;

function loadGoogleSignin(): typeof GoogleSigninType | null {
  if (cachedModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      cachedModule = require('@react-native-google-signin/google-signin').GoogleSignin;
    } catch {
      cachedModule = null;
    }
  }
  return cachedModule ?? null;
}

function requireGoogleSignin(): typeof GoogleSigninType {
  const module = loadGoogleSignin();
  if (!module) {
    throw new GoogleSignInUnavailableError();
  }
  return module;
}

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  requireGoogleSignin().configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    scopes: [DRIVE_FILE_SCOPE],
    offlineAccess: false,
  });
  configured = true;
}

export interface GoogleAccount {
  email: string;
  name: string | null;
}

function toGoogleAccount(user: User): GoogleAccount {
  return { email: user.user.email, name: user.user.name };
}

export async function signInWithGoogle(): Promise<GoogleAccount> {
  const googleSignin = requireGoogleSignin();
  ensureConfigured();
  await googleSignin.hasPlayServices();
  const response = await googleSignin.signIn();
  if (response.type !== 'success') {
    throw new Error('Login cancelado pelo usuário.');
  }
  return toGoogleAccount(response.data);
}

/**
 * Never throws - if the native module isn't available (e.g. Expo Go) or
 * nothing is signed in, simply reports "not connected". Called eagerly
 * whenever the Settings screen (or the connection modal) mounts, so it
 * must always be safe to call.
 */
export function getCurrentGoogleAccount(): GoogleAccount | null {
  const module = loadGoogleSignin();
  if (!module) return null;
  try {
    ensureConfigured();
    const current = module.getCurrentUser();
    return current ? toGoogleAccount(current) : null;
  } catch {
    return null;
  }
}

export async function signOutFromGoogle(): Promise<void> {
  const googleSignin = requireGoogleSignin();
  ensureConfigured();
  await googleSignin.signOut();
}

export async function getDriveAccessToken(): Promise<string> {
  const googleSignin = requireGoogleSignin();
  ensureConfigured();
  const { accessToken } = await googleSignin.getTokens();
  return accessToken;
}
