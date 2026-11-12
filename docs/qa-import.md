# Migrar un tracker QA a Nodo

Nodo permite importar un proyecto con páginas, bloques de QA y un registro de bugs. La importación conserva los estados del archivo, las referencias, la clasificación, la automatización, las notas, el histórico y los enlaces. Cada registro conserva su fila de origen.

## Convertir el archivo original

El conversor requiere Python 3 y utiliza únicamente su biblioteca estándar. Es compatible con trackers que tengan encabezados en la fila 5 y columnas A:J con referencia, nombre, estado QA, clasificación, automatización, aviso, enlace, última nota, histórico e ID Azure. Las hojas auxiliares Resumen, Opciones y Consolidacion se interpretan como metadatos, no como casos adicionales.

Ejecuta la conversión fuera de las carpetas públicas del proyecto:

```powershell
python scripts/convert-qa-tracker.py "C:/ruta/tracker.xlsx" "C:/ruta/privada/tracker.nodo.json"
```

El archivo de salida contiene información de trabajo. Guárdalo fuera del repositorio. El conversor no modifica el Excel, no ejecuta macros ni fórmulas, y no consulta Azure. Los enlaces explícitos y los IDs se conservan. El formato no incluye adjuntos, imágenes ni acceso remoto a evidencias.

En Nodo, inicia sesión y selecciona **Importar proyecto** en la barra lateral. Elige el archivo `.json`, revisa las páginas, cantidades y observaciones, y selecciona **Importar a mi espacio**. Los datos se guardan en la cuenta que realiza la importación. Si vuelves a importar exactamente el mismo paquete, se abre el proyecto existente sin sobrescribir sus cambios. Si está en la papelera, debes recuperarlo allí.

## Estados y conteos

- Los estados originales se conservan: CERRADO no significa PASS.
- PASS y CORREGIDO son casos validados. CERRADO, CANCELADO y NO APLICA son cierres administrativos o exclusiones.
- El progreso general mide trabajo resuelto: validados más cierres y exclusiones, dividido entre todos los casos. No es una tasa de éxito de ejecución.
- Los registros con nombre y estado, pero sin referencia, se conservan como casos y se señalan para revisión.
- Las filas sin referencia ni estado se conservan como referencias históricas, sin aumentar el número de casos.
- Los bugs se cuentan por ID único del registro de bugs. Un caso con BUG RELACIONADO no crea otra incidencia.
- Si un WI aparece en una feature pero no en el registro central, se incorpora como POR CONFIRMAR. Un enlace y el estado del caso no establecen el estado actual del WI.
- El estado del caso y el estado del bug se editan por separado. No existe sincronización automática con Azure o Jira.

Las pestañas QA permiten buscar, filtrar, paginar, agregar y editar registros. El detalle muestra todos los campos. Las opciones de clasificación, automatización y última nota provienen del archivo, y también admiten texto propio. Cambiar un ID genera su enlace cuando el tracker proporciona una URL base de Azure.

Los bloques de QA y sus filas se duplican con nuevos identificadores. La papelera permite recuperar páginas y proyectos. Eliminar una fila desde su tabla requiere confirmación y no tiene recuperación individual en esta versión.
