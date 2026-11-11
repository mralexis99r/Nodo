import { randomUUID as id } from 'node:crypto';

const doc = (text) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
export function sampleProject(language = 'es') {
  const es = language === 'es';
  return {
    title: 'Nodo',
    icon: 'layers',
    color: 'blue',
    description: es
      ? 'Un espacio simple para conectar ideas, proyectos y lo que sigue.'
      : 'A simple space to connect ideas, projects, and what comes next.',
    pages: [
      {
        title: es ? 'Vista general' : 'Overview',
        icon: 'book',
        status: 'progress',
        blocks: [
          {
            id: id(),
            type: 'text',
            content: doc(
              es
                ? 'Menos ruido. Más claridad. Este es tu primer proyecto: reúne aquí tus ideas, divide el trabajo en features y deja que el progreso se actualice con tus tareas. Todo este contenido es editable.'
                : 'Less noise. More clarity. This is your first project: collect your ideas, organize work into features, and let your tasks keep progress up to date. All of this content is editable.',
            ),
          },
          {
            id: id(),
            type: 'report',
            title: es ? 'El proyecto en un vistazo' : 'Project at a glance',
          },
          {
            id: id(),
            type: 'link',
            title: es ? 'Explorar Figma' : 'Explore Figma',
            url: 'https://www.figma.com/',
            preview: true,
          },
        ],
      },
      {
        title: 'Feature Login',
        icon: 'code',
        status: 'progress',
        blocks: [
          {
            id: id(),
            type: 'text',
            content: doc(
              es
                ? 'Objetivo: que cada persona tenga un espacio propio y privado. Usa esta tabla para seguir el trabajo y pega el enlace de tu WI en la última columna.'
                : 'Goal: give everyone a private workspace. Track your work in this table and paste your work item link in the last column.',
            ),
          },
          {
            id: id(),
            type: 'table',
            title: es ? 'Plan de trabajo' : 'Work plan',
            rows: [
              {
                id: id(),
                title: es ? 'Diseñar la pantalla de acceso' : 'Design the sign-in screen',
                status: 'done',
                priority: 'medium',
                url: '',
              },
              {
                id: id(),
                title: es ? 'Crear usuarios y sesiones' : 'Create users and sessions',
                status: 'progress',
                priority: 'high',
                url: '',
              },
              {
                id: id(),
                title: es ? 'Validar permisos por usuario' : 'Validate user permissions',
                status: 'todo',
                priority: 'high',
                url: '',
              },
            ],
          },
        ],
      },
      {
        title: 'Feature Payments',
        icon: 'terminal',
        status: 'todo',
        blocks: [
          {
            id: id(),
            type: 'text',
            content: doc(
              es
                ? 'Un ejemplo de otra feature. Puedes renombrarla, cambiar su icono o eliminarla. Nodo es gratuito: esta pestaña es solo una plantilla de trabajo.'
                : 'An example of another feature. Rename it, change its icon, or delete it. Nodo is free: this tab is only a work template.',
            ),
          },
          {
            id: id(),
            type: 'table',
            title: es ? 'Pendientes' : 'Tasks',
            rows: [
              {
                id: id(),
                title: es ? 'Documentar los requerimientos' : 'Document requirements',
                status: 'todo',
                priority: 'medium',
                url: '',
              },
              {
                id: id(),
                title: es ? 'Revisar el flujo de usuario' : 'Review the user flow',
                status: 'todo',
                priority: 'low',
                url: '',
              },
            ],
          },
        ],
      },
    ],
  };
}
