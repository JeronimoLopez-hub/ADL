# ADL Punto Creativo

## GitHub Pages, Render y MongoDB Atlas

GitHub Pages mantiene la web estática. La API se ejecuta en Render y guarda los usuarios en `sample_mflix.users` de MongoDB Atlas. Los documentos propios de ADL incluyen `app: "adl"` para separarlos de los datos de ejemplo ya presentes en esa colección. Las contraseñas se guardan como hashes bcrypt. La API entrega un token firmado que el navegador mantiene en la sesión actual.

El catálogo está definido en el código de `index.html`, en la constante `productos`. Para agregar, editar o quitar un producto, modifica esa lista desde Visual Studio Code y publica los cambios de la web. No hay un panel de administración ni se guardan cambios del catálogo en MongoDB. El carrito sigue guardándose localmente en el navegador.

### Publicar la API

1. Sube estos cambios al mismo repositorio de GitHub que publica la página.
2. En Render, crea un **Blueprint** y conecta ese repositorio. Render leerá `render.yaml` y creará el servicio web `adl-auth-api`.
3. En la configuración del servicio de Render, añade `MONGODB_URI` como variable secreta. Usa la URI de MongoDB Atlas y un usuario de base de datos con acceso `readWrite` únicamente a `sample_mflix`. No pongas la URI en el repositorio ni en el código de la web.
4. En Atlas, configura el acceso de red para permitir las conexiones salientes del servicio Render. Si tu plan de Render no ofrece IP saliente fija, sigue la guía actual de Render/Atlas; si necesitas permitir `0.0.0.0/0`, protege la cuenta con una contraseña robusta y permisos limitados a `sample_mflix`.
5. Espera a que Render termine el despliegue. Comprueba que `https://adl-auth-api.onrender.com/api/health` responda `{"ok":true}`.
6. La página ya apunta a `https://adl-auth-api.onrender.com`. Si Render asigna otra URL, actualiza `API_BASE_URL` al comienzo del script de `index.html` y `GITHUB_PAGES_ORIGIN` en Render con el origen exacto de GitHub Pages (sin la ruta `/ADL/` ni una barra final). Guarda y sube ese cambio a GitHub.
7. El despliegue de GitHub Pages debe publicar el `index.html` actualizado. El servicio Render debe desplegar también `server.js`. Abre la URL HTTPS de Pages, inicia sesión y verifica que el catálogo aparezca. En Atlas, los usuarios están en `sample_mflix` → `users` (filtro `{ "app": "adl" }`).

Render genera `JWT_SECRET` automáticamente mediante `render.yaml`. El navegador solo conoce la URL pública de la API; las credenciales de MongoDB permanecen en Render. Si el servicio gratuito está inactivo, la primera solicitud puede tardar en responder mientras Render lo inicia. El token se borra al cerrar sesión o la pestaña del navegador.

### Desarrollo local

Instala Node.js 18 o posterior, configura `.env` a partir de `.env.example` y define `MONGODB_URI`, `JWT_SECRET` y `GITHUB_PAGES_ORIGIN=http://localhost:3000`. Cambia temporalmente `API_BASE_URL` a `http://localhost:3000`, ejecuta `npm install` y `npm start`, y abre `http://localhost:3000`.

Las cuentas anteriores guardadas solo en el `localStorage` del navegador no se migran; cada persona debe registrarse de nuevo. El endpoint de registro crea cuentas normales. Nunca compartas la URI de MongoDB ni la contraseña de la base de datos.
