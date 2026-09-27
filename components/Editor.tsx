'use client';

import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor as TiptapEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

type Props = {
  content: string;
  onChange: (html: string) => void;
};

export default function Editor({ content, onChange }: Props) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [StarterKit],
    content,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: 'prose' } },
    onUpdate: ({ editor }) => onChangeRef.current(editor.getHTML()),
  });

  if (!editor) return <div className="editor-loading" />;

  return (
    <div className="editor">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="editor-body" />
    </div>
  );
}

function Toolbar({ editor }: { editor: TiptapEditor }) {
  const chain = () => editor.chain().focus();
  const buttons: { label: string; title: string; active?: boolean; run: () => void; className?: string }[] = [
    { label: 'B', title: 'Bold (Ctrl+B)', className: 'b', active: editor.isActive('bold'), run: () => chain().toggleBold().run() },
    { label: 'I', title: 'Italic (Ctrl+I)', className: 'i', active: editor.isActive('italic'), run: () => chain().toggleItalic().run() },
    { label: 'U', title: 'Underline (Ctrl+U)', className: 'u', active: editor.isActive('underline'), run: () => chain().toggleUnderline().run() },
    { label: 'S', title: 'Strikethrough', className: 's', active: editor.isActive('strike'), run: () => chain().toggleStrike().run() },
    { label: 'H1', title: 'Heading 1', active: editor.isActive('heading', { level: 1 }), run: () => chain().toggleHeading({ level: 1 }).run() },
    { label: 'H2', title: 'Heading 2', active: editor.isActive('heading', { level: 2 }), run: () => chain().toggleHeading({ level: 2 }).run() },
    { label: 'H3', title: 'Heading 3', active: editor.isActive('heading', { level: 3 }), run: () => chain().toggleHeading({ level: 3 }).run() },
    { label: '• List', title: 'Bulleted list', active: editor.isActive('bulletList'), run: () => chain().toggleBulletList().run() },
    { label: '1. List', title: 'Numbered list', active: editor.isActive('orderedList'), run: () => chain().toggleOrderedList().run() },
    { label: '❝', title: 'Quote', active: editor.isActive('blockquote'), run: () => chain().toggleBlockquote().run() },
    { label: '</>', title: 'Code block', active: editor.isActive('codeBlock'), run: () => chain().toggleCodeBlock().run() },
    { label: '―', title: 'Divider', run: () => chain().setHorizontalRule().run() },
  ];

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      {buttons.map((b) => (
        <button
          key={b.title}
          type="button"
          title={b.title}
          aria-label={b.title}
          aria-pressed={b.active}
          className={`tool ${b.className ?? ''} ${b.active ? 'active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={b.run}
        >
          {b.label}
        </button>
      ))}
      <span className="tool-sep" />
      <button type="button" className="tool" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!editor.can().undo()} onMouseDown={(e) => e.preventDefault()} onClick={() => chain().undo().run()}>↶</button>
      <button type="button" className="tool" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!editor.can().redo()} onMouseDown={(e) => e.preventDefault()} onClick={() => chain().redo().run()}>↷</button>
    </div>
  );
}
