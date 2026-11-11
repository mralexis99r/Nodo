# Arquitectura inicial

## Objetivo

Un monolito pequeño y fácil de ejecutar: ReactJS presenta el espacio personal, Node.js valida y persiste las operaciones, y SQLite guarda los datos en un archivo. La interfaz y la API comparten origen para simplificar sesiones y despliegue.

## Modelo

```mermaid
erDiagram
  users ||--o{ sessions : owns
  users ||--o{ projects : owns
  projects ||--o{ pages : contains
  users {
    string id PK
    string email UK
    string password_hash
    string name
    string avatar
    string language
    string theme
  }
  sessions {
    string token_hash PK
    string user_id FK
    integer expires_at
  }
  projects {
    string id PK
    string user_id FK
    string title
    string icon
    string color
    boolean favorite
    string deleted_at
  }
  pages {
    string id PK
    string project_id FK
    string title
    string status
    string blocks
    integer position
    integer version
    string deleted_at
  }
```

Cada página almacena bloques estructurados como JSON validado por Zod. Los bloques tienen ID propio y un tipo: `text`, `table`, `report` o `link`. Las filas de una tabla tienen ID, título, estado, prioridad y URL. El texto enriquecido utiliza JSON de Tiptap, sin insertar HTML arbitrario.

Los estados internos son `todo`, `progress`, `blocked` y `done`. Son independientes de las traducciones de interfaz.

## Cálculo del avance

1. Se consideran las páginas activas del proyecto.
2. Si alguna contiene tareas, se cuentan las tareas de todas las tablas activas. Una tarea sin título también cuenta hasta que se elimine.
3. Si no hay tareas, se utilizan los estados de las páginas.
4. Avance = unidades completadas / unidades totales, redondeado a un porcentaje entero.
5. Un bloqueo tiene prioridad; después se consideran completado, en curso y pendiente.

Un proyecto vacío está pendiente y tiene 0 % de avance. La API calcula los resúmenes al consultarlos. El editor actualiza la vista del proyecto después de guardar. Al volver al dashboard se consulta el resumen actual; no hay actualización en tiempo real entre dispositivos.

Los contadores por estado se guardan bajo `counts` para distinguir `counts.progress` del porcentaje `progress`.

## Sesiones y aislamiento

- Identificadores UUID y consultas SQL parametrizadas.
- Sesiones opacas aleatorias; solo su hash se persiste.
- Cookie HttpOnly y SameSite Strict; Secure en producción.
- scrypt asíncrono con salt de 16 bytes y hash de 64 bytes.
- Límite de intentos en registro e inicio de sesión.
- Escrituras requieren la cabecera `X-Nodo-Client` y un origen permitido cuando el navegador envía `Origin`. No se habilita CORS entre sitios.
- Las páginas se consultan mediante un JOIN con el propietario del proyecto.
- Eliminación lógica para proyectos y páginas. No hay borrado permanente en la interfaz.
- URLs limitadas a HTTP y HTTPS. Las tarjetas no solicitan recursos remotos ni incrustan documentos de terceros.
- Helmet establece cabeceras de seguridad y una política de contenido. Las respuestas de API usan `Cache-Control: no-store`.

## Guardado

El editor espera 800 ms después del último cambio. Serializa las solicitudes y sigue guardando si hay nuevas modificaciones durante una solicitud. Cada escritura debe incluir la versión que se leyó; una versión antigua devuelve HTTP 409.

Antes de cambiar de página, navegar o cerrar sesión, se intenta guardar. Si falla, la navegación dentro de la aplicación se cancela y los cambios permanecen en la ventana. El navegador advierte antes de cerrar una pestaña con cambios pendientes. No hay edición offline ni borradores persistentes: cerrar forzosamente el navegador puede perder cambios que todavía no se guardaron.

## API principal

| Recurso                                   | Operaciones                                |
| ----------------------------------------- | ------------------------------------------ |
| `/api/auth/register`, `/login`, `/logout` | Autenticación                              |
| `/api/me`                                 | Perfil y preferencias                      |
| `/api/dashboard`                          | Resumen del usuario                        |
| `/api/projects`                           | Listado con filtros y paginación; creación |
| `/api/projects/:id`                       | Consulta, edición y papelera               |
| `/api/projects/:id/duplicate`, `/restore` | Duplicación y recuperación                 |
| `/api/projects/:id/pages`                 | Creación de páginas                        |
| `/api/pages/:id`                          | Guardado con versión y papelera            |
| `/api/pages/:id/duplicate`, `/restore`    | Duplicación y recuperación                 |
| `/api/trash`                              | Papelera del usuario                       |

## Límites conocidos

Esta base no incluye colaboración, permisos compartidos, recuperación de contraseña, verificación de correo, carga de archivos, importación de Notion, edición simultánea, OAuth ni sincronización de proveedores. El registro crea una cuenta local; no verifica que la persona controle el correo indicado.

Los límites técnicos iniciales son 1 MB por solicitud, 100 bloques por página y 500 tareas por tabla. Las sesiones duran siete días y el límite de acceso es de 30 intentos por IP cada 15 minutos. El rate limiter usa memoria del proceso.

SQLite y las consultas síncronas son adecuados para esta primera escala. Para crecer: migraciones versionadas, PostgreSQL, pruebas de carga, un almacenamiento compartido para los límites de acceso y una estrategia operativa de respaldo. El esquema inicial usa `PRAGMA user_version = 1`; antes de modificarlo en futuras versiones se deben agregar migraciones explícitas, sin reemplazar datos existentes.

## Referencias técnicas

- [Vite](https://vite.dev/guide/)
- [TailwindCSS con Vite](https://tailwindcss.com/docs/installation/using-vite)
- [SQLite de Node.js](https://nodejs.org/api/sqlite.html)
- [Extensiones de Tiptap](https://tiptap.dev/docs/editor/core-concepts/extensions)
