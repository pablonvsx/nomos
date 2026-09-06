import {
  GoogleSignin,
  statusCodes,
  type User,
} from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

const GOOGLE_WEB_CLIENT_ID = Constants.expoConfig?.extra?.googleWebClientId as string;
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  GoogleSignin.configure({
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
  ensureConfigured();
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();

  if (response.type !== 'success') {
    throw new Error('Login cancelado pelo usuário.');
  }

  return toGoogleAccount(response.data);
}

export function getCurrentGoogleAccount(): GoogleAccount | null {
  ensureConfigured();
  const current = GoogleSignin.getCurrentUser();
  return current ? toGoogleAccount(current) : null;
}

export async function signOutFromGoogle(): Promise<void> {
  ensureConfigured();
  await GoogleSignin.signOut();
}

export async function getDriveAccessToken(): Promise<string> {
  ensureConfigured();
  const { accessToken } = await GoogleSignin.getTokens();
  return accessToken;
}

export function isCancelledSignIn(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === statusCodes.SIGN_IN_CANCELLED
  );
}
