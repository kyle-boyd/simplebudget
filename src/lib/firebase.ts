import { initializeApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDT5QAzYQat7X_GFLbqh2d18dfYGzkwb98",
  authDomain: "simple-budgeting-5f9cb.firebaseapp.com",
  projectId: "simple-budgeting-5f9cb",
  storageBucket: "simple-budgeting-5f9cb.firebasestorage.app",
  messagingSenderId: "4204953002",
  appId: "1:4204953002:web:b57ab7d41c7abd23587fd3",
  measurementId: "G-K969YZNXGC",
  databaseURL: "https://simple-budgeting-5f9cb-default-rtdb.firebaseio.com/"
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


