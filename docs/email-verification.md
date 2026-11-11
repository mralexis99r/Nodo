# Verificación del correo

El registro requiere escribir dos veces el mismo correo y verificar su propiedad con un código enviado por email. El registro pendiente no crea una sesión ni permite entrar al dashboard. La activación ocurre únicamente después de validar el código y la contraseña del registro.

## Comportamiento

1. El servidor comprueba que ambos correos coincidan, normalizando mayúsculas y minúsculas.
2. Guarda una cuenta pendiente con contraseña protegida mediante scrypt.
3. Genera seis dígitos con `crypto.randomInt`, incluyendo ceros iniciales si corresponde.
4. Envía el código por SMTP. Solo se guarda un HMAC SHA-256 ligado al usuario, con una clave del servidor que vive fuera de la base de datos.
5. El código vence a los 10 minutos, aunque no se ingrese. El servidor comprueba la hora; modificar el reloj o el contador del navegador no amplía su validez.
6. Después de 5 intentos incorrectos, ese código queda bloqueado.
7. Al validarlo, el servidor marca el correo como verificado, elimina la huella activa del código y crea la sesión. El mismo código no se puede volver a usar.
8. Si vence o se bloquea, el usuario puede solicitar otro. Cada envío reemplaza al anterior; hay 60 segundos de espera y un máximo de 5 envíos por cuenta cada hora. No se envían correos automáticamente en un ciclo al vencer.

Las rutas de registro, acceso, verificación y reenvío comparten además el límite por IP de 30 solicitudes cada 15 minutos. Los intentos y los límites por cuenta se conservan en SQLite, incluyendo tras reiniciar el servidor.

La contraseña necesaria para verificar o reenviar permanece únicamente en la memoria del formulario. No se guarda en `localStorage`, URLs ni cookies. Si se cierra o recarga la página, se debe volver a iniciar sesión con el correo y la contraseña para continuar la verificación.

## Configurar correo real

Nodo todavía necesita que su operador elija y configure un proveedor de correo. El conector de Gmail del chat no funciona como servidor de correo para los visitantes de la aplicación.

1. Copia `.env.example` a `.env` si el archivo local todavía no existe.
2. Completa `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM` con los valores del proveedor.
3. Genera una clave exclusiva para `EMAIL_CODE_SECRET`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

4. Guarda esa clave en `.env` y reinicia Node.js. Conserva la misma clave entre reinicios; cambiarla invalida los códigos pendientes.

Ejemplo con valores ficticios:

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
MAIL_FROM=Nodo <noreply@example.com>
EMAIL_CODE_SECRET=replace-with-a-unique-random-secret-of-at-least-32-bytes
```

El puerto 587 usa STARTTLS obligatorio. Para TLS desde el inicio, utiliza el puerto 465. El cliente valida los certificados; no desactiva TLS ni acepta certificados inválidos. Según el proveedor, puede ser necesario validar el remitente o configurar un dominio y sus registros DNS.

Sin SMTP o sin una clave suficiente, el registro devuelve un error de configuración y no crea una cuenta activa. Si falla una entrega después de crear el registro pendiente, se anula el código que no pudo entregarse y se permite volver a intentarlo respetando los límites. El usuario también puede iniciar sesión de nuevo para retomar la verificación.

No se muestran códigos en la interfaz, respuestas de API o logs. No hay un modo de omitir la verificación en producción. Los tests usan un remitente simulado e inyectado, sin contactar proveedores externos.

## Cuentas existentes

La migración conserva las cuentas y sus proyectos. Como los registros anteriores no tenían una comprobación del correo, permanecen sin verificar. Las sesiones anteriores se invalidan. Al entrar con su contraseña, el usuario verá la pantalla de verificación y podrá solicitar su código cuando SMTP esté configurado.

## API

| Ruta                                 | Resultado                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `POST /api/auth/register`            | HTTP 202 con datos de caducidad y reenvío; no incluye sesión ni código              |
| `POST /api/auth/login`               | HTTP 403 con `EMAIL_NOT_VERIFIED` para una cuenta pendiente con contraseña correcta |
| `POST /api/auth/verify-email`        | Recibe correo, contraseña y seis dígitos; activa la cuenta y crea la sesión         |
| `POST /api/auth/resend-verification` | Recibe correo y contraseña; genera y envía un código nuevo                          |

## Referencias

- [OWASP: códigos aleatorios, uso único, caducidad y límites de intentos](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
- [Nodemailer: configuración SMTP y STARTTLS](https://nodemailer.com/smtp).
