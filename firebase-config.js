// =========================================================
// CONFIGURACIÓN DE FIREBASE
// Pega aquí la configuración web de tu proyecto Firebase
// (Consola de Firebase → Configuración del proyecto → Tus apps → Configuración del SDK).
// Estas claves son públicas por diseño; la seguridad está en firestore.rules.
// =========================================================
export const firebaseConfig = {
  apiKey: "AIzaSyC3wnYq-20yWQiBljzcSRWIdQ9mFrygbrE",
  authDomain: "jicara-tareas.firebaseapp.com",
  projectId: "jicara-tareas",
  storageBucket: "jicara-tareas.firebasestorage.app",
  messagingSenderId: "1072858944562",
  appId: "1:1072858944562:web:ff768cd8c6867ff2b0d82b"
};

// =========================================================
// USUARIOS — correo → nombre que aparece en la app.
// Si cambias los correos (p. ej. a correos corporativos),
// cámbialos aquí Y en firestore.rules.
// Los nombres deben ser exactamente "Julian" y "Matteo".
// =========================================================
export const USERS = {
  "julianf.barboza@gmail.com": "Julian",
  "matteocontolini@gmail.com": "Matteo"
};
