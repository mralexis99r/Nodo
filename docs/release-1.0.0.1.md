# Nodo 1.0.0.1

## Casos de prueba desde Excel

Dentro de un proyecto, **Importar casos de prueba** permite elegir una matriz `.xlsx` o un paquete `.json`. La vista previa muestra los casos y las advertencias antes de guardarlos en una página nueva. La importación conserva descripción, prerrequisitos, datos, requerimiento, caso de uso, tipo y prioridad originales, y cada paso con su resultado esperado. Las celdas con fórmulas se leen desde su valor guardado; nunca se ejecutan macros ni fórmulas.

El formato soportado es la matriz con las columnas F a O: Id Caso de Prueba, Caso de Prueba, Descripción, Pre-Requisitos, Datos de Prueba, No. Paso, Descripción del Paso, Resultado Esperado, Estatus y Prioridad. El ID de la columna F prevalece sobre un prefijo diferente en el nombre. La diferencia se advierte y ambos valores originales se conservan. Los pasos de continuación se agrupan en el caso correspondiente.

`MTC-FT-001 - Validar login` se convierte en `ATC_FT001_ValidarLogin`. El nombre legible se conserva aparte. Cada archivo genera identificadores estables: importar la misma matriz en el mismo proyecto abre su página existente, sin restablecer los resultados editados. Un archivo modificado se considera una importación distinta.

Los archivos y paquetes privados deben permanecer fuera de GitHub.

## Progreso y bugs

Los cinco grupos del progreso son Pendientes, En curso, Bloqueados, Completados y Fallados o bugs. Se pueden pulsar para abrir una lista paginada con sus WI, referencias y acceso a la página. Los grupos no se solapan. El porcentaje sigue midiendo trabajo resuelto, incluyendo cierres administrativos; no es una tasa de éxito de ejecución.

**Reporte de bugs** es un bloque que puede agregarse a cualquier página y alternar entre esta página y todo el proyecto. Consolida bugs de registros existentes, bugs creados en el reporte y casos fallados con WI relacionado. Permite crear bugs locales y vincular varios casos al mismo bug. Los IDs de Azure se identifican junto con su organización y proyecto para no mezclar incidencias de espacios distintos.

Editar estado, título, comentario o historial desde el reporte actualiza todas las conexiones activas del bug dentro del proyecto, con control de versiones y transacción. Los registros antiguos de bugs también comparten esos cambios. La validación de cada caso es independiente: cerrar el bug no cambia automáticamente un FAIL a PASS. Las referencias históricas y la papelera no forman parte del reporte. Estas conexiones son internas a Nodo; no escriben en Azure DevOps ni Jira.

## Nombres por idioma

Las páginas guardan el nombre original, su idioma y las traducciones. El nombre mostrado y el título editable cambian con el idioma del sistema. Renombrar una página invalida las traducciones anteriores. No se traducen pasos, notas ni contenido de los casos.

`TITLE_TRANSLATION_PROVIDER=mymemory` habilita la traducción automática de los nombres personalizados mediante [MyMemory](https://mymemory.translated.net/doc/spec.php). Solo se envía el nombre y el par de idiomas. Las traducciones se guardan para reducir consultas. El servicio tiene [cuotas de uso](https://mymemory.translated.net/doc/usagelimits.php); si falla o alcanza su cuota, se conserva el original y se muestra un aviso. Algunos nombres comunes se traducen localmente.

## Base de datos y validación

La migración añade `title_language` y `title_translations` a las páginas, sin modificar sus bloques, estados ni versiones. SQLite pasa a versión 3 y PostgreSQL a versión 2. Se prueba primero en una rama aislada de producción. Las versiones anteriores de Nodo que rechazan PostgreSQL versión 2 necesitan adaptar esa comprobación para un rollback; la migración no elimina datos.

La versión visible es 1.0.0.1. El paquete npm usa `1.0.0-1`, su representación válida para las herramientas de versionado.
