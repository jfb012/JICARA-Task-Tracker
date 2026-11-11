// Conexión a Firebase (cargado desde el CDN oficial, sin build).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut, connectAuthEmulator, signInWithCredential
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  connectFirestoreEmulator, collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc,
  getDoc, getDocs, serverTimestamp, Timestamp, writeBatch, query, limit
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from '../firebase-config.js';

// Modo emulador (solo para pruebas locales): http://localhost:xxxx/?emulator
export const EMULATOR = ['localhost', '127.0.0.1'].includes(location.hostname)
  && new URLSearchParams(location.search).has('emulator');

const cfg = EMULATOR
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-tgc' }
  : firebaseConfig;

export const configured = EMULATOR || !String(firebaseConfig.apiKey).includes('PEGAR');

const app = initializeApp(cfg);
export const auth = getAuth(app);

let cache;
try {
  cache = EMULATOR ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() });
} catch { cache = memoryLocalCache(); }
export const db = initializeFirestore(app, { localCache: cache });

if (EMULATOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  // Ayuda para pruebas automáticas: iniciar sesión sin ventana de Google.
  window.__testSignIn = (email, verified = true) =>
    signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({
      sub: 'u-' + email.replace(/\W/g, ''), email, email_verified: verified, name: email.split('@')[0]
    })));
}

export async function login() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
      await signInWithRedirect(auth, provider);
    } else throw e;
  }
}
getRedirectResult(auth).catch(() => {});

export const logout = () => signOut(auth);

export {
  onAuthStateChanged, collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc,
  getDoc, getDocs, serverTimestamp, Timestamp, writeBatch, query, limit
};
