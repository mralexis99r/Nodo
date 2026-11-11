# Despliegue con planes gratuitos

La aplicación se publica como un servicio Node.js en Render. Ese proceso sirve React y la API desde el mismo origen, con cookies HttpOnly y HTTPS. Neon proporciona PostgreSQL persistente y Brevo envía los códigos por su API HTTPS. GitHub conserva el código y ejecuta las comprobaciones.

Los planes gratuitos tienen límites de uso y pueden cambiar. Render puede suspender el servicio por inactividad, de modo que la primera visita puede tardar en cargar. No se usa el disco temporal de Render para guardar cuentas o documentos. GitHub Pages no ejecuta este backend.

## Configuración

1. Crea un proyecto gratuito en Neon y una base PostgreSQL. Copia su conexión, preferiblemente la conexión con pooling.
2. Crea un servicio web gratuito en Render conectado a `mralexis99r/Nodo`, rama `main`, región Virginia.
3. Usa `npm ci --include=dev && npm run build` como build y `npm start` para iniciar. El blueprint `render.yaml` declara la misma configuración.
4. Configura los secretos en Render; nunca los agregues a GitHub:

| Variable            | Valor                                    |
| ------------------- | ---------------------------------------- |
| `DATABASE_URL`      | Conexión privada de Neon                 |
| `NODE_ENV`          | `production`                             |
| `NODE_VERSION`      | `22`                                     |
| `HOST`              | `0.0.0.0`                                |
| `TRUST_PROXY`       | `1`, para el proxy de Render             |
| `EMAIL_CODE_SECRET` | Secreto aleatorio, al menos 32 bytes     |
| `MAIL_PROVIDER`     | `brevo`                                  |
| `BREVO_API_KEY`     | Clave API de Brevo, no la clave SMTP     |
| `MAIL_FROM_EMAIL`   | Correo del remitente verificado en Brevo |
| `MAIL_FROM_NAME`    | `Nodo`                                   |

El puerto lo proporciona Render. No configures `APP_ORIGIN` con localhost: si lo omites, se usa automáticamente `RENDER_EXTERNAL_URL`, proporcionado por Render. Para un dominio propio, configura `APP_ORIGIN` con su dirección HTTPS exacta.

La inicialización de PostgreSQL se ejecuta antes de escuchar solicitudes. Las migraciones usan una transacción y un bloqueo asesor compartido entre instancias. La cuenta de base de datos debe tener permisos de creación para la primera inicialización. En producción, la ausencia de `DATABASE_URL` impide iniciar el servidor.

## Correo y registro

En Brevo, verifica un remitente que controles y genera una clave de API. Para empezar puede ser un correo existente; Brevo puede sustituir el dominio del remitente por uno de sus dominios de envío. Un dominio propio autenticado es la opción preferida para producción estable.

Sin remitente y clave válidos, el sitio puede abrirse, pero las cuentas nuevas permanecen bloqueadas: no hay códigos ficticios ni activación automática. Antes de anunciar el servicio, comprueba registro, recepción del correo, verificación e inicio de sesión con un destinatario real.

## Importar los datos locales

La importación es opcional y no ocurre al desplegar. Mantén una copia de la carpeta local `data`. La base de destino debe estar vacía de usuarios.

Configura temporalmente `DATABASE_URL` en tu `.env` local y ejecuta:

```powershell
npm run db:import -- .\data\nodo.sqlite
```

El importador lee una instantánea coherente de SQLite y copia usuarios, hashes de contraseña, proyectos y páginas en una sola transacción. Conserva identificadores, versiones, favoritos y elementos de papelera. No copia sesiones ni códigos pendientes. Rechaza destinos con usuarios para evitar sobrescrituras. No cambia ni elimina el archivo SQLite. Para volver a trabajar con SQLite local, deja `DATABASE_URL` vacío después de importar.

## Comprobaciones antes de publicar

- `/api/health` comprueba la conexión con la base de datos.
- Registro y verificación real de correo.
- Privacidad entre dos cuentas.
- Persistencia de los datos después de reiniciar o redesplegar el servicio.
- CI aprobada: Node.js 22 y 24, y PostgreSQL 17 real.

La invitación de boda puede permanecer en su repositorio y publicación independiente. Despublicarla no libera capacidad necesaria para Nodo; puede retirarse cuando el reemplazo esté verificado, conservando su código.

## Referencias

- [Servicios web de Render](https://render.com/docs/web-services).
- [Limitaciones de Render gratuito](https://render.com/docs/free).
- [Conectar con Neon](https://neon.com/docs/connect/connect-intro).
- [API de correo transaccional de Brevo](https://developers.brevo.com/docs/send-a-transactional-email).
