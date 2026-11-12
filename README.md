# Nodo

Un espacio personal para conectar ideas, notas y proyectos. Simple, minimalista y abierto a la comunidad.

Nodo reúne proyectos con páginas por feature, bloques de texto, tablas de tareas y reportes que reflejan el avance del trabajo. Cada cuenta tiene su propio espacio privado.

## Ejecutar en desarrollo

Requiere **Node.js 22.16 o superior** y npm. Se recomienda una versión LTS actualizada. SQLite está incluido en Node.js; no necesitas instalar un servidor de base de datos.

```powershell
git clone https://github.com/mralexis99r/Nodo.git
cd Nodo
npm ci
npm run dev
```

Abre [Nodo en tu equipo](http://127.0.0.1:5173). La API se ejecuta en el puerto 3001. Para crear y activar cuentas debes [configurar primero el proveedor de correo](docs/email-verification.md). Puedes utilizar la API de Brevo o un servidor SMTP compatible. El registro pide escribir el correo dos veces y confirmarlo con un código de seis dígitos. Puedes explorar un proyecto de ejemplo desde el inicio; sus datos son editables y pertenecen únicamente a tu cuenta.

La aplicación puede arrancar sin `.env`, pero no activa cuentas sin correo verificado. Para configurar el correo y las demás opciones:

```powershell
Copy-Item .env.example .env
```

`APP_ORIGIN` debe coincidir exactamente con el origen que abres en el navegador, incluyendo protocolo y puerto. Por defecto es `http://127.0.0.1:5173`.

## Incluido en la versión 0.1

- Registro, acceso y cierre de sesión con cuentas independientes.
- Verificación obligatoria por correo: código de seis dígitos, caducidad de 10 minutos y un solo uso; reenvíos con límites y anulación del código anterior.
- Dashboard con proyectos activos, trabajo pendiente y completado, y páginas recientes.
- Proyectos con nombre, descripción, icono, color y favoritos.
- Páginas como pestañas: por ejemplo, Feature Login y Feature Payments.
- Bloques de texto con negritas, cursivas, títulos, listas, color y resaltado.
- Tablas de tareas con estado, prioridad, enlaces y paginación.
- Importación privada de trackers QA con pestañas por feature, estados originales, histórico, búsqueda y registro de bugs por ID único. Consulta [la migración de trackers](docs/qa-import.md).
- Selección múltiple de ATC y edición por lote de estado, clasificación y automatización.
- Catálogos estándar y reportes configurables como gráficas de barras o tablas.
- Tabla de HUs y trabajo para desarrollo, con tipo, área y recordatorios por fecha en Inicio.
- Reportes de avance calculados a partir de las tareas de todas las páginas.
- Tarjetas visuales para enlaces de Figma, Jira, Azure DevOps y otros recursos.
- Guardado automático, reintento y detección de conflictos entre ventanas.
- Edición, duplicación y papelera recuperable para proyectos y páginas.
- Duplicación, eliminación y cambio de orden de bloques.
- Búsqueda, filtros, favoritos y paginación de proyectos.
- Perfil con avatar de icono; temas claro, oscuro y del sistema.
- Interfaz en español e inglés. El idioma no traduce el contenido escrito por el usuario.
- Diseño adaptable, navegación por teclado y diálogos con control de foco.

Las vistas previas de enlaces son tarjetas locales con proveedor, título y URL. **No existe todavía sincronización con las APIs de Figma, Jira o Azure DevOps**, ni extracción remota de miniaturas o estados. Puedes pegar el enlace de un WI y administrar su estado dentro de Nodo.

## Persistencia y privacidad

En desarrollo, sin `DATABASE_URL`, los datos se guardan en `data/nodo.sqlite`. Cuando configuras `DATABASE_URL`, Nodo utiliza PostgreSQL. En producción PostgreSQL es obligatorio: la aplicación nunca utiliza un SQLite temporal como alternativa si falta la conexión. La carpeta `data/`, las dependencias y los archivos `.env` están excluidos de Git. El código publicado no contiene cuentas, contraseñas ni documentos personales.

Las contraseñas usan scrypt con salt independiente. Las sesiones se guardan en el servidor mediante un hash del token y una cookie HttpOnly, SameSite Strict, con vigencia de siete días. Las consultas verifican al propietario del proyecto y de cada página. No hay espacios compartidos en esta versión.

Para hacer una copia de respaldo inicial, detén Nodo y copia **toda la carpeta `data`**. Mantén los respaldos fuera del repositorio y con acceso restringido. La privacidad entre cuentas no sustituye la protección del equipo o del servidor que contiene la base de datos.

## Compilar y alojar

```powershell
npm run build
npm start
```

Sin configuración adicional, este comando sirve la aplicación compilada en `http://127.0.0.1:3001`. Para usarla desde ese origen, configura `APP_ORIGIN=http://127.0.0.1:3001` en `.env` antes de iniciar.

Para alojarla en un servidor, configura:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
APP_ORIGIN=https://nodo.example.com
DATABASE_URL=postgresql://user:password@your-neon-host/nodo?sslmode=require
TRUST_PROXY=1
MAIL_PROVIDER=brevo
BREVO_API_KEY=your-private-api-key
MAIL_FROM_EMAIL=your-verified-sender@example.com
MAIL_FROM_NAME=Nodo
EMAIL_CODE_SECRET=your-random-secret-of-at-least-32-bytes
```

Usa HTTPS mediante un proxy inverso. En producción las cookies requieren HTTPS y la conexión remota a PostgreSQL valida el certificado TLS. `TRUST_PROXY=1` supone exactamente un proxy de confianza; ajusta ese valor a tu topología. Render proporciona `RENDER_EXTERNAL_URL`; Nodo lo utiliza como origen cuando no hay `APP_ORIGIN` explícito. Consulta [el despliegue gratuito con Render, Neon y Brevo](docs/cloud-deployment.md). Los planes gratuitos tienen cuotas y el código de Nodo no requiere suscripción.

## Comandos

| Comando                | Función                                       |
| ---------------------- | --------------------------------------------- |
| `npm run dev`          | React y API con recarga automática            |
| `npm test`             | Pruebas de API, privacidad, estados e idiomas |
| `npm run build`        | Compilar la interfaz                          |
| `npm start`            | Servir API e interfaz compilada               |
| `npm run format`       | Formatear código y documentación              |
| `npm run format:check` | Verificar el formato                          |

## Stack y estructura

ReactJS con Vite, TailwindCSS, Node.js con Express, PostgreSQL para producción, SQLite para uso local y Tiptap para texto enriquecido. El despliegue propuesto utiliza planes gratuitos con cuotas.

```text
src/
  App.jsx            Acceso, dashboard, proyectos y perfil
  Project.jsx        Proyecto, pestañas y resumen
  editor/            Editor, tablas, enlaces y reportes
  i18n.js            Textos del sistema en español e inglés
  ui.jsx             Componentes compartidos e iconos
  styles.css         Tokens y estilos de interfaz
server/
  app.js             API y control de acceso
  db.js              Esquema y consultas de resumen
  schema.js          Validación de entradas
  sample.js          Proyecto de ejemplo opcional
  tests/             Pruebas automatizadas
docs/
  architecture.md    Decisiones y modelo de datos
  roadmap.md         Evolución propuesta
```

Los identificadores del código están en inglés; los archivos usan UTF-8 y los textos de interfaz están centralizados. Consulta [la arquitectura](docs/architecture.md) y [el roadmap](docs/roadmap.md) para continuar el proyecto.

## Contribuir

Consulta [CONTRIBUTING.md](CONTRIBUTING.md). Licencia [MIT](LICENSE).

Built for a simpler personal workspace. The interface supports Spanish and English; your content stays in the language you write it.
