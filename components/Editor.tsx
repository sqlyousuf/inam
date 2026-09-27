'use client';

import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor as TiptapEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import type { EditorView } from '@tiptap/pm/view';

type Props = {
  content: string;
  onChange: (html: string) => void;
  /** Uploads a pasted or dropped image and returns the URL to show it from. */
  onImageUpload: (file: File) => Promise<string>;
  onError: (error: unknown) => void;
};

function imageFiles(data: DataTransfer | null) {
  return Array.from(data?.files ?? []).filter((file) => file.type.startsWith('image/'));
}

/** Points images with the temporary src at their uploaded URL, or removes them when `to` is null. */
function replaceImage(view: EditorView, from: string, to: string | null) {
  if (view.isDestroyed) return;
  const tr = view.state.tr;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image' || node.attrs.src !== from) return;
    const at = tr.mapping.map(pos);
    if (to) tr.setNodeMarkup(at, undefined, { ...node.attrs, src: to });
    else tr.delete(at, at + node.nodeSize);
  });
  if (tr.docChanged) view.dispatch(tr);
}

export default function Editor({ content, onChange, onImageUpload, onError }: Props) {
  const callbacks = useRef({ onChange, onImageUpload, onError });
  useEffect(() => {
    callbacks.current = { onChange, onImageUpload, onError };
  }, [onChange, onImageUpload, onError]);

  // Shows each image straight away from a local preview, then swaps in the uploaded copy.
  function insertImages(view: EditorView, files: File[], pos?: number) {
    for (const file of files) {
      const preview = URL.createObjectURL(file);
      const node = view.state.schema.nodes.image.create({ src: preview, alt: file.name });
      const tr = pos === undefined ? view.state.tr.replaceSelectionWith(node) : view.state.tr.insert(pos, node);
      view.dispatch(tr);
      callbacks.current
        .onImageUpload(file)
        .then((url) => replaceImage(view, preview, url))
        .catch((error) => {
          replaceImage(view, preview, null);
          callbacks.current.onError(error);
        })
        .finally(() => URL.revokeObjectURL(preview));
    }
  }

  const editor = useEditor({
    extensions: [StarterKit, Image.configure({ allowBase64: false })],
    content,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { class: 'prose' },
      handlePaste: (view, event) => {
        const files = imageFiles(event.clipboardData);
        if (!files.length) return false;
        event.preventDefault();
        insertImages(view, files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = imageFiles(event.dataTransfer);
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        insertImages(view, files, pos);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Wait until pasted images finish uploading so a temporary preview link is never saved.
      if (!html.includes('src="blob:')) callbacks.current.onChange(html);
    },
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
