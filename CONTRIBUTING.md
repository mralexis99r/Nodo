# Contribuir a Nodo

El objetivo es mantener un espacio personal simple y útil. Antes de ampliar la arquitectura, abre un issue con el problema concreto y el comportamiento esperado.

1. Crea una rama `codex/nombre-del-cambio` o una rama descriptiva para tu contribución.
2. Usa identificadores en inglés y archivos UTF-8.
3. Coloca los textos de interfaz en `src/i18n.js`, en español e inglés. No traduzcas automáticamente el contenido del usuario.
4. Mantén los tokens de color y la compatibilidad con los temas claro y oscuro.
5. Si agregas una ruta, valida la entrada y comprueba al propietario en el servidor.
6. Agrega pruebas para cambios de autenticación, privacidad o reglas de negocio.
7. Ejecuta `npm run format`, `npm test` y `npm run build`.
8. Describe el comportamiento resultante y cómo lo verificaste en el pull request.

No incluyas bases de datos, archivos `.env`, tokens, documentos personales ni credenciales en commits o issues.
