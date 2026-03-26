import { initializeApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Connect to emulators in development mode
// Check for explicit flag or development mode
const useEmulators = 
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' || 
  (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS !== 'false');

if (useEmulators) {
  const auth = getAuth(app);
  const db = getDatabase(app);

  // Connect to Auth Emulator
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    console.log('🔌 Connected to Firebase Auth Emulator');
  } catch (error: any) {
    // Emulator already connected or connection failed
    if (error?.message?.includes('already')) {
      console.log('Auth Emulator already connected');
    } else {
      console.warn('Failed to connect to Auth Emulator:', error);
    }
  }

  // Connect to Database Emulator
  try {
    connectDatabaseEmulator(db, 'localhost', 9000);
    console.log('🔌 Connected to Firebase Database Emulator');
  } catch (error: any) {
    // Emulator already connected or connection failed
    if (error?.message?.includes('already')) {
      console.log('Database Emulator already connected');
    } else {
      console.warn('Failed to connect to Database Emulator:', error);
    }
  }
}

export const db = getDatabase(app);
export const auth = getAuth(app);

export default app;


