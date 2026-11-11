import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import { Bold, Heading2, Highlighter, Italic, List, Redo2, Undo2 } from 'lucide-react';
import { IconButton } from '../ui';

export default function RichText({ value, onChange, t }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          protocols: ['http', 'https'],
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'rich-text-content',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': t('textBlock'),
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getJSON()),
    immediatelyRender: false,
  });
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            bold: current.isActive('bold'),
            italic: current.isActive('italic'),
            heading: current.isActive('heading'),
            list: current.isActive('bulletList'),
            highlight: current.isActive('highlight'),
          }
        : {},
  });
  if (!editor) return null;
  return (
    <div className="rich-text-block">
      <div className="rich-toolbar" role="toolbar" aria-label={t('textBlock')}>
        {[
          [Bold, 'bold', () => editor.chain().focus().toggleBold().run(), state?.bold],
          [Italic, 'italic', () => editor.chain().focus().toggleItalic().run(), state?.italic],
          [
            Heading2,
            'heading',
            () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
            state?.heading,
          ],
          [List, 'bulletList', () => editor.chain().focus().toggleBulletList().run(), state?.list],
        ].map(([Component, label, action, active]) => (
          <IconButton
            key={label}
            label={t(label)}
            className={active ? 'active' : ''}
            aria-pressed={active || false}
            onClick={action}
          >
            <Component size={15} />
          </IconButton>
        ))}
        <span className="toolbar-divider" />
        <IconButton
          label={t('highlight')}
          className={state?.highlight ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleHighlight({ color: '#fce7a5' }).run()}
        >
          <Highlighter size={15} />
        </IconButton>
        <label className="text-color-control" title={t('textColor')}>
          <span>A</span>
          <input
            type="color"
            aria-label={t('textColor')}
            defaultValue="#2383e2"
            onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
          />
        </label>
        <span className="toolbar-divider" />
        <IconButton label={t('undo')} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 size={14} />
        </IconButton>
        <IconButton label={t('redo')} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 size={14} />
        </IconButton>
      </div>
      <EditorContent editor={editor} />
      <span className="rich-placeholder">{editor.isEmpty ? t('textHint') : ''}</span>
    </div>
  );
}
