# ADL Punto Creativo

## Usuarios y MongoDB

El registro, el inicio de sesión, las sesiones y los permisos de publicación usan MongoDB. Las contraseñas se guardan como hashes bcrypt; la sesión se conserva en una cookie `HttpOnly` y en la colección `sessions`. La URI de MongoDB y el secreto de sesión solo se configuran en el servidor.

### Puesta en marcha

1. Instala Node.js 18 o posterior.
2. Crea una base de datos en MongoDB Atlas o usa una instancia local. En Atlas, permite la conexión desde la dirección IP del servidor.
3. Copia `.env.example` a `.env` y completa `MONGODB_URI` con la URI de conexión de tu base de datos. No publiques ni compartas el archivo `.env`.
4. Genera un valor aleatorio y privado de al menos 32 caracteres para `SESSION_SECRET`.
5. Ejecuta `npm install` y luego `npm start`.
6. Abre `http://localhost:3000`. El sitio debe servirse desde este servidor para que funcionen las rutas de autenticación; abrir `index.html` directamente o alojarlo como sitio estático no conecta con MongoDB.

### Crear el administrador

Configura temporalmente `ADMIN_EMAIL` y `ADMIN_PASSWORD` en el entorno del servidor y ejecuta `npm run create-admin`. Este comando crea o actualiza esa cuenta con el rol de administrador. En PowerShell:

```powershell
$env:ADMIN_EMAIL = "admin@ejemplo.com"
$env:ADMIN_PASSWORD = "una-contrasena-segura"
npm run create-admin
Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD
```

No guardes la contraseña de administrador en el repositorio ni en `.env`. Los usuarios que se registren desde la web reciben permisos normales.

Las cuentas anteriores guardadas en el `localStorage` del navegador no se migran. Los usuarios deben crear una cuenta nueva en el sitio servido por Node.js.

En producción, configura `NODE_ENV=production` y sirve el sitio mediante HTTPS para que la cookie de sesión sea segura. Si hay un proxy HTTPS confiable delante de Node.js, configura también `TRUST_PROXY=true`.
