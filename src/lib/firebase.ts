import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

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
export const db = getDatabase(app);
export const auth = getAuth(app);

export default app;


