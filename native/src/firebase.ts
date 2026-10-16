import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Public client configuration, same project and security rules as the website.
const app = initializeApp({
  apiKey: 'AIzaSyAq02XXQkepvHsgHEN4zTZni8pp20r1jUU',
  authDomain: 'zibaldone-1-prova.firebaseapp.com', projectId: 'zibaldone-1-prova',
  storageBucket: 'zibaldone-1-prova.firebasestorage.app', messagingSenderId: '578635223914',
  appId: '1:578635223914:web:74e1adc0de09af1a03cb13',
});
export const auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
export const db = getFirestore(app);
