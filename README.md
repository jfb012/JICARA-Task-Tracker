[README.md](https://github.com/user-attachments/files/34699115/README.md)
# JICARA-Task-Tracker
Task tracker temporal para JICARA
# Tareas — The Good Cup

Tablero de tareas compartido y en vivo para Julian y Matteo. Es una herramienta temporal: sencilla, sin servidor propio y fácil de exportar.

- Página estática en **GitHub Pages** (HTML/CSS/JS, sin paso de compilación).
- Datos en **Firebase Firestore** (en vivo) e inicio de sesión con **Google**.
- Se instala como app en el teléfono (PWA).

Tiempo total de configuración: unos 20–30 minutos. No hace falta saber programar.

---

## Archivos importantes

| Archivo | Para qué sirve |
|---|---|
| `firebase-config.js` | Aquí pegas la configuración de Firebase y la lista correo → nombre. |
| `firestore.rules` | Reglas de seguridad: **solo los dos correos permitidos** pueden leer o escribir. |
| `css/theme.css` | Todos los colores y la tipografía, por si quieres cambiar el estilo. |

---

## Paso 1 — Subir el código a GitHub

1. Entra a [github.com](https://github.com) y crea un repositorio nuevo (botón **New**). Nombre sugerido: `tareas`. Márcalo como **Public**. No agregues README.
2. En la página del repositorio vacío, haz clic en **uploading an existing file**.
3. Descomprime el zip que recibiste y **arrastra todo el contenido de la carpeta** (no la carpeta en sí) a la página: `index.html`, `firebase-config.js`, `firestore.rules`, `manifest.webmanifest`, `sw.js`, `.nojekyll`, `README.md` y las carpetas `css`, `js`, `icons`.
   - Si tu computadora oculta el archivo `.nojekyll`, no pasa nada: la app funciona igual.
4. Clic en **Commit changes**.

## Paso 2 — Activar GitHub Pages y obtener la URL

1. En el repositorio: **Settings → Pages**.
2. En **Source** elige **Deploy from a branch**. Rama: **main**, carpeta: **/ (root)**. **Save**.
3. Espera 1–2 minutos y recarga. Arriba aparecerá la URL, algo como:
   `https://TU-USUARIO.github.io/tareas/`
4. Guarda esa URL; la necesitas en el paso 4.

## Paso 3 — Crear el proyecto de Firebase (plan gratuito)

1. Entra a [console.firebase.google.com](https://console.firebase.google.com) **con el Gmail de Julian**.
2. **Crear un proyecto** → nombre `tgc-tareas` → puedes desactivar Google Analytics → **Crear**.
3. El proyecto queda en el plan **Spark (gratuito)**. No cambies el plan.
4. Agrega a Matteo como dueño: ícono de engranaje ⚙️ → **Usuarios y permisos** → **Agregar miembro** → `matteocontolini@gmail.com` → rol **Propietario (Owner)** → **Agregar**.

## Paso 4 — Activar el inicio de sesión con Google

1. Menú izquierdo: **Compilación (Build) → Authentication → Comenzar**.
2. Pestaña **Método de inicio de sesión** → **Google** → **Habilitar** → elige tu correo de asistencia → **Guardar**.
3. Pestaña **Configuración → Dominios autorizados → Agregar dominio** → escribe solo el dominio de GitHub Pages, sin `https://` ni la carpeta. Ejemplo: `tu-usuario.github.io`.

## Paso 5 — Crear Firestore y publicar las reglas

1. Menú izquierdo: **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: cualquiera cercana (p. ej. `us-central` o `nam5`). Modo: **producción**. **Crear**.
3. Pestaña **Reglas**: borra todo lo que aparece, abre el archivo `firestore.rules` de este repositorio, copia **todo** su contenido y pégalo. **Publicar**.

> Las reglas son las que protegen los datos. Mientras no estén publicadas, nadie (ni ustedes) puede usar la app.

## Paso 6 — Pegar la configuración web en `firebase-config.js`

1. En Firebase: ⚙️ **Configuración del proyecto → General**. Abajo, en **Tus apps**, haz clic en el ícono **`</>`** (Web).
2. Apodo: `tareas`. **No** marques Firebase Hosting. **Registrar app**.
3. Verás un bloque con `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`. Copia solo los valores.
4. En GitHub, abre `firebase-config.js` → ícono de lápiz ✏️ (Edit) → reemplaza cada `PEGAR_AQUI` con el valor correspondiente. Ejemplo:

   ```js
   export const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "tgc-tareas.firebaseapp.com",
     projectId: "tgc-tareas",
     storageBucket: "tgc-tareas.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```
5. **Commit changes**. Espera 1–2 minutos a que GitHub Pages se actualice.

> Estas claves son públicas por diseño (cualquier app web de Firebase las expone). La seguridad está en las reglas del paso 5.

## Paso 7 — Probar

1. Abre la URL de GitHub Pages → **Entrar con Google** → con el Gmail de Julian.
2. La primera vez se crean automáticamente los 8 temas.
3. Matteo hace lo mismo desde su teléfono o computadora. Los cambios de uno aparecen al instante en la pantalla del otro.
4. Si alguien entra con otra cuenta de Google verá **"Acceso no autorizado"** y ningún dato.

**Prueba recomendada de las reglas:** en Firebase → Firestore → **Reglas** → **Zona de pruebas de reglas (Rules Playground)**: tipo `get`, ubicación `/tasks/prueba`, activa **Autenticado**, proveedor Google, y en el correo pon uno que no esté en la lista → debe salir **Denegado**. Con uno de los dos correos → **Permitido**.

## Paso 8 — Instalar en la pantalla de inicio del teléfono

**iPhone (Safari):** abre la URL → botón **Compartir** (cuadro con flecha) → **Agregar a pantalla de inicio** → **Agregar**.

**Android (Chrome):** abre la URL → menú **⋮** → **Instalar app** (o **Agregar a pantalla de inicio**).

Aparecerá un ícono negro con una **T**. Abre la app desde ahí e inicia sesión una vez.

---

## Cómo se usa (resumen)

- **+** (abajo a la derecha): alta rápida con título, responsable y tema. El resto se edita tocando la tarea.
- **Tablero / Lista** (arriba): en computadora el tablero permite arrastrar tarjetas entre columnas. En el teléfono, toca la etiqueta de estado de una tarjeta para cambiarla; en el tablero desliza entre columnas o toca las pestañas.
- **Filtros:** Mías / De Matteo (o De Julian) / Todas, tema y prioridad. "Mías" incluye las asignadas a **Ambos**.
- **Vencidas** (fecha pasada y no terminadas) se ven en rojo fuerte y aparecen primero.
- **"N nuevas para ti":** tareas que el otro te asignó (o a Ambos) desde tu última visita. Se dejan de marcar al abrirlas.
- **Compartir por WhatsApp** (dentro de cada tarea): abre WhatsApp con un mensaje y el enlace directo a la tarea.
- **Archivo** (menú ⋯): las tareas en *Terminado* por más de 7 días se archivan solas al abrir la app. Desde el Archivo se buscan y se restauran con un toque.
- **Temas** (menú ⋯): agregar, renombrar o cambiar color.
- **Exportar** (menú ⋯): descarga un CSV (para Excel/Sheets, una fila por tarea y una por subtarea) y un JSON (respaldo completo). Hagan un respaldo de vez en cuando.
- **Eliminar:** dentro de la tarea, con confirmación. No se puede deshacer.

---

## Cambiar los correos permitidos (p. ej. a correos corporativos)

Hay que cambiarlos en **dos** lugares:

1. **`firestore.rules`** — la lista dentro de `allowedEmails()`:
   ```
   function allowedEmails() {
     return [
       'julian@nuevodominio.com',
       'matteo@nuevodominio.com'
     ];
   }
   ```
   Luego copia el archivo completo en Firebase → Firestore → **Reglas** → **Publicar**. (Cambiarlo solo en GitHub **no** basta: lo que cuenta es lo publicado en Firebase.)
2. **`firebase-config.js`** — la lista `USERS`, que dice qué nombre corresponde a cada correo:
   ```js
   export const USERS = {
     "julian@nuevodominio.com": "Julian",
     "matteo@nuevodominio.com": "Matteo"
   };
   ```
   Commit en GitHub.

Usa minúsculas en los correos. Los datos existentes no se pierden.

---

## Problemas comunes

- **"Falta configurar Firebase"**: aún hay `PEGAR_AQUI` en `firebase-config.js` (paso 6).
- **La ventana de Google se abre y se cierra con error / "unauthorized-domain"**: falta agregar el dominio `tu-usuario.github.io` en Authentication → Dominios autorizados (paso 4).
- **"Acceso no autorizado" con un correo correcto**: revisa que las reglas estén publicadas en Firebase y que el correo esté escrito igual (paso 5).
- **No veo los últimos cambios del código**: GitHub Pages tarda 1–2 minutos. En el teléfono, cierra la app por completo y vuelve a abrirla. Si sigue igual, cambia `tareas-v1` por `tareas-v2` en `sw.js`.

---

## Notas técnicas

- Sin dependencias ni compilación: Firebase JS SDK 10.14.1 se carga desde el CDN oficial (`gstatic.com`).
- Colecciones de Firestore: `tasks` (las subtareas van dentro de cada tarea), `subjects` (temas) y `users` (última visita de cada uno, para "nuevas para ti").
- Las fechas se muestran en español con zona horaria America/Costa_Rica ("vie 14 nov").
- Para pruebas locales existe un modo emulador (`http://localhost:PUERTO/?emulator`) que se conecta a los emuladores de Firebase en `127.0.0.1` (Auth 9099, Firestore 8080). No afecta la versión publicada.
- Uso esperado muy por debajo de los límites gratuitos de Firebase (plan Spark).
