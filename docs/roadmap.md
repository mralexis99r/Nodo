# Roadmap

La dirección del producto es mantener Nodo simple, funcional y minimalista. Este archivo separa lo implementado de las siguientes decisiones; no promete fechas ni servicios gratuitos de terceros.

## 0.1: base funcional

- [x] ReactJS, Node.js y TailwindCSS.
- [x] Cuentas privadas y sesiones.
- [x] Dashboard, proyectos y pestañas por feature.
- [x] Texto enriquecido, tablas de tareas y reportes.
- [x] Tarjetas locales para enlaces de trabajo.
- [x] Favoritos, búsqueda, paginación, duplicación y papelera.
- [x] Iconos editables, colores, perfil y temas claro y oscuro.
- [x] Interfaz en español e inglés con UTF-8.
- [x] Pruebas de aislamiento y CI.

## Siguiente iteración: decisiones con el arquitecto

- [ ] Revisar la experiencia visual y los flujos con uso diario real.
- [x] Confirmación doble del correo y verificación obligatoria por código de uso único.
- [ ] Configurar un proveedor SMTP real para enviar códigos.
- [ ] Recuperación de contraseña.
- [ ] Exportación y respaldo desde la interfaz.
- [ ] Importar notas y contenido desde Notion o Markdown.
- [ ] Tablas con columnas personalizadas y vistas de tablero.
- [ ] Reordenar páginas y bloques mediante arrastre.
- [ ] Búsqueda global en el contenido de las notas.
- [ ] Borradores recuperables y mejor recuperación de sesiones expiradas.

## Integraciones

- [ ] Elegir el primer proveedor: Jira o Azure DevOps.
- [ ] Definir OAuth o tokens individuales, permisos y cifrado de credenciales.
- [ ] Consultar metadatos reales de un WI: título, estado y responsable.
- [ ] Definir si la sincronización será de lectura o también de escritura.
- [ ] Integrar vistas de Figma con permisos explícitos.
- [ ] Agregar webhooks, manejo de límites de API y política de actualización.

## Escala y comunidad

- [ ] Definir plataforma de alojamiento y operación.
- [ ] Incorporar migraciones y valorar PostgreSQL según el uso.
- [ ] Agregar observabilidad y pruebas de carga.
- [ ] Evaluar colaboración únicamente si mantiene clara la privacidad del espacio personal.
