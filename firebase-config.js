// =========================================================
// CONFIGURACIÓN DE FIREBASE
// Pega aquí la configuración web de tu proyecto Firebase
// (Consola de Firebase → Configuración del proyecto → Tus apps → Configuración del SDK).
// Estas claves son públicas por diseño; la seguridad está en firestore.rules.
// =========================================================
export const firebaseConfig = {
  apiKey: "PEGAR_AQUI",
  authDomain: "PEGAR_AQUI.firebaseapp.com",
  projectId: "PEGAR_AQUI",
  storageBucket: "PEGAR_AQUI.appspot.com",
  messagingSenderId: "PEGAR_AQUI",
  appId: "PEGAR_AQUI"
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
