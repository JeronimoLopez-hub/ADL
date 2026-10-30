# ADL Punto Creativo

## GitHub Pages, Render y MongoDB Atlas

GitHub Pages mantiene la web estática. La API se ejecuta en Render y guarda los usuarios en `sample_mflix.users` y el catálogo compartido en `sample_mflix.adl_products` de MongoDB Atlas. Los documentos de usuarios de ADL incluyen `app: "adl"` para separarlos de los datos de ejemplo ya presentes. Las contraseñas se guardan como hashes bcrypt. La API entrega un token firmado que el navegador mantiene en la sesión actual.

El catálogo se carga desde la API para todos los usuarios que iniciaron sesión. Si `adl_products` está vacía, la API la inicializa con los cuatro productos que vienen de fábrica. El administrador y los usuarios autorizados desde el panel de permisos pueden crear y editar productos; los cambios se guardan en MongoDB y se ven desde otros dispositivos. Cada producto acepta una imagen principal y hasta siete URLs de imágenes adicionales. Las imágenes subidas desde el equipo se guardan como datos en el documento de MongoDB y deben pesar 3 MB o menos.

Al iniciar sesión por primera vez con la cuenta de administrador en un navegador que aún tenga productos guardados en `localStorage`, los productos que no estén ya en MongoDB se importan automáticamente una sola vez. Los productos con el mismo nombre que uno ya guardado no se duplican.

### Publicar la API

1. Sube estos cambios al mismo repositorio de GitHub que publica la página.
2. En Render, crea un **Blueprint** y conecta ese repositorio. Render leerá `render.yaml` y creará el servicio web `adl-auth-api`.
3. En la configuración del servicio de Render, añade `MONGODB_URI` como variable secreta. Usa la URI de MongoDB Atlas y un usuario de base de datos con acceso `readWrite` únicamente a `sample_mflix`. No pongas la URI en el repositorio ni en el código de la web.
4. En Atlas, configura el acceso de red para permitir las conexiones salientes del servicio Render. Si tu plan de Render no ofrece IP saliente fija, sigue la guía actual de Render/Atlas; si necesitas permitir `0.0.0.0/0`, protege la cuenta con una contraseña robusta y permisos limitados a `sample_mflix`.
5. Espera a que Render termine el despliegue. Comprueba que `https://adl-auth-api.onrender.com/api/health` responda `{"ok":true}`.
6. La página ya apunta a `https://adl-auth-api.onrender.com`. Si Render asigna otra URL, actualiza `API_BASE_URL` al comienzo del script de `index.html` y `GITHUB_PAGES_ORIGIN` en Render con el origen exacto de GitHub Pages (sin la ruta `/ADL/` ni una barra final). Guarda y sube ese cambio a GitHub.
7. El despliegue de GitHub Pages debe publicar el `index.html` actualizado. El servicio Render debe desplegar también `server.js`. Abre la URL HTTPS de Pages, inicia sesión y verifica que el catálogo aparezca. En Atlas, los usuarios están en `sample_mflix` → `users` (filtro `{ "app": "adl" }`) y el catálogo en `sample_mflix` → `adl_products`.

Render genera `JWT_SECRET` automáticamente mediante `render.yaml`. El navegador solo conoce la URL pública de la API; las credenciales de MongoDB permanecen en Render. Si el servicio gratuito está inactivo, la primera solicitud puede tardar en responder mientras Render lo inicia. El token se borra al cerrar sesión o la pestaña del navegador.

### Desarrollo local

Instala Node.js 18 o posterior, configura `.env` a partir de `.env.example` y define `MONGODB_URI`, `JWT_SECRET` y `GITHUB_PAGES_ORIGIN=http://localhost:3000`. Cambia temporalmente `API_BASE_URL` a `http://localhost:3000`, ejecuta `npm install` y `npm start`, y abre `http://localhost:3000`.

### Crear o actualizar el administrador

Desde una computadora que tenga Node.js, configura temporalmente las variables de entorno y ejecuta `npm run create-admin` con el mismo `.env` que apunta a `sample_mflix`. En PowerShell:

```powershell
$env:ADMIN_EMAIL = "admin@ejemplo.com"
$env:ADMIN_PASSWORD = "una-contrasena-segura"
npm run create-admin
Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD
```

El comando crea o actualiza solo el usuario de ADL correspondiente a ese correo. No guardes ni compartas la contraseña.

Las cuentas anteriores guardadas solo en el `localStorage` del navegador no se migran; cada persona debe registrarse de nuevo. El endpoint de registro crea cuentas normales. Nunca compartas la URI de MongoDB ni la contraseña de la base de datos.
