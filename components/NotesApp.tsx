'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { put } from '@vercel/blob/client';
import Editor from './Editor';

type Section = { id: string; name: string };
type Notebook = { id: string; name: string; sections: Section[] };
type PageSummary = { id: string; title: string; updated_at: string };
type Attachment = { id: string; name: string; size: number | string; content_type: string; created_at: string };
type Page = PageSummary & { content: string; attachments: Attachment[] };
type Upload = { key: string; name: string; percent: number };
type View = 'notebooks' | 'pages' | 'page';

type Props = {
  user: { id: string; email: string };
  blobAccess: 'private' | 'public';
};

async function api<T>(url: string, options: { method?: string; json?: unknown; keepalive?: boolean } = {}): Promise<T> {
  const res = await fetch(url, {
    method: options.method ?? 'GET',
    keepalive: options.keepalive,
    headers: options.json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
  });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Your session has expired');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

function formatSize(value: number | string) {
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function safeFileName(name: string) {
  return name.replace(/[^\w.\- ]+/g, '_').slice(-120) || 'file';
}

export default function NotesApp({ user, blobAccess }: Props) {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [notebookId, setNotebookId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [pageId, setPageId] = useState<string | null>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('notebooks');
  const fileInput = useRef<HTMLInputElement>(null);

  const report = useCallback((err: unknown) => {
    setError((err as Error).message || 'Something went wrong');
  }, []);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(t);
  }, [error]);

  // ---- Autosave: edits are batched and saved one request at a time, in order ----
  const pending = useRef<{ id: string; title?: string; content?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inflight = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback((keepalive = false) => {
    clearTimeout(timer.current);
    inflight.current = inflight.current.then(async () => {
      const change = pending.current;
      if (!change) return;
      pending.current = null;
      const { id, ...body } = change;
      try {
        const saved = await api<PageSummary>(`/api/pages/${id}`, { method: 'PATCH', json: body, keepalive });
        setPages((list) => list.map((p) => (p.id === id ? { ...p, updated_at: saved.updated_at } : p)));
        setSaveState(pending.current ? 'saving' : 'saved');
      } catch (err) {
        // Keep the unsaved edits so the next change retries them.
        const newer = pending.current as typeof change | null;
        if (!newer) pending.current = change;
        else if (newer.id === id) pending.current = { ...change, ...newer };
        setSaveState('error');
        report(err);
      }
    });
    return inflight.current;
  }, [report]);

  const queueSave = useCallback(
    (id: string, patch: { title?: string; content?: string }) => {
      if (pending.current && pending.current.id !== id) void flush();
      pending.current = { ...(pending.current ?? {}), ...patch, id };
      setSaveState('saving');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 800);
    },
    [flush],
  );

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!pending.current) return;
      void flush(true);
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [flush]);

  // ---- Loading ----
  useEffect(() => {
    api<Notebook[]>('/api/notebooks')
      .then((list) => {
        setNotebooks(list);
        if (list[0]) {
          setNotebookId(list[0].id);
          setSectionId(list[0].sections[0]?.id ?? null);
        }
      })
      .catch(report)
      .finally(() => setLoading(false));
  }, [report]);

  useEffect(() => {
    setPages([]);
    setPageId(null);
    if (!sectionId) return;
    let cancelled = false;
    api<PageSummary[]>(`/api/sections/${sectionId}/pages`)
      .then((list) => {
        if (cancelled) return;
        setPages(list);
        setPageId(list[0]?.id ?? null);
      })
      .catch(report);
    return () => {
      cancelled = true;
    };
  }, [sectionId, report]);

  useEffect(() => {
    setPage(null);
    if (!pageId) return;
    let cancelled = false;
    // Wait for any in-progress save so we never load stale content.
    inflight.current
      .then(() => api<Page>(`/api/pages/${pageId}`))
      .then((p) => {
        if (!cancelled) setPage(p);
      })
      .catch(report);
    return () => {
      cancelled = true;
    };
  }, [pageId, report]);

  // ---- Notebooks ----
  function selectNotebook(nb: Notebook) {
    void flush();
    setNotebookId(nb.id);
    setSectionId(nb.sections[0]?.id ?? null);
  }

  async function addNotebook() {
    const name = window.prompt('Notebook name', 'New notebook');
    if (name === null) return;
    try {
      const nb = await api<Notebook>('/api/notebooks', { method: 'POST', json: { name } });
      setNotebooks((list) => [...list, nb]);
      selectNotebook(nb);
    } catch (err) {
      report(err);
    }
  }

  async function renameNotebook(nb: Notebook) {
    const name = window.prompt('Rename notebook', nb.name);
    if (name === null || name.trim() === nb.name) return;
    try {
      const saved = await api<Notebook>(`/api/notebooks/${nb.id}`, { method: 'PATCH', json: { name } });
      setNotebooks((list) => list.map((n) => (n.id === nb.id ? { ...n, name: saved.name } : n)));
    } catch (err) {
      report(err);
    }
  }

  async function deleteNotebook(nb: Notebook) {
    if (!window.confirm(`Delete the notebook "${nb.name}" with all its sections, pages and files?\n\nThis cannot be undone.`)) return;
    try {
      await api(`/api/notebooks/${nb.id}`, { method: 'DELETE' });
      pending.current = null;
      const rest = notebooks.filter((n) => n.id !== nb.id);
      setNotebooks(rest);
      if (notebookId === nb.id) {
        setNotebookId(rest[0]?.id ?? null);
        setSectionId(rest[0]?.sections[0]?.id ?? null);
      }
    } catch (err) {
      report(err);
    }
  }

  // ---- Sections ----
  function selectSection(nbId: string, secId: string) {
    void flush();
    setNotebookId(nbId);
    setSectionId(secId);
    setView('pages');
  }

  async function addSection(nb: Notebook) {
    const name = window.prompt('Section name', 'New section');
    if (name === null) return;
    try {
      const section = await api<Section>('/api/sections', { method: 'POST', json: { notebookId: nb.id, name } });
      setNotebooks((list) => list.map((n) => (n.id === nb.id ? { ...n, sections: [...n.sections, section] } : n)));
      selectSection(nb.id, section.id);
    } catch (err) {
      report(err);
    }
  }

  async function renameSection(nb: Notebook, section: Section) {
    const name = window.prompt('Rename section', section.name);
    if (name === null || name.trim() === section.name) return;
    try {
      const saved = await api<Section>(`/api/sections/${section.id}`, { method: 'PATCH', json: { name } });
      setNotebooks((list) =>
        list.map((n) =>
          n.id === nb.id ? { ...n, sections: n.sections.map((s) => (s.id === section.id ? { ...s, name: saved.name } : s)) } : n,
        ),
      );
    } catch (err) {
      report(err);
    }
  }

  async function deleteSection(nb: Notebook, section: Section) {
    if (!window.confirm(`Delete the section "${section.name}" with all its pages and files?\n\nThis cannot be undone.`)) return;
    try {
      await api(`/api/sections/${section.id}`, { method: 'DELETE' });
      pending.current = null;
      const rest = nb.sections.filter((s) => s.id !== section.id);
      setNotebooks((list) => list.map((n) => (n.id === nb.id ? { ...n, sections: rest } : n)));
      if (sectionId === section.id) setSectionId(rest[0]?.id ?? null);
    } catch (err) {
      report(err);
    }
  }

  // ---- Pages ----
  function selectPage(id: string) {
    void flush();
    setPageId(id);
    setView('page');
  }

  async function addPage() {
    if (!sectionId) return;
    try {
      const created = await api<PageSummary>('/api/pages', { method: 'POST', json: { sectionId } });
      setPages((list) => [...list, created]);
      selectPage(created.id);
    } catch (err) {
      report(err);
    }
  }

  async function deletePage(p: PageSummary) {
    if (!window.confirm(`Delete the page "${p.title || 'Untitled page'}" and its files?\n\nThis cannot be undone.`)) return;
    try {
      if (pending.current?.id === p.id) pending.current = null;
      await api(`/api/pages/${p.id}`, { method: 'DELETE' });
      const index = pages.findIndex((x) => x.id === p.id);
      const rest = pages.filter((x) => x.id !== p.id);
      setPages(rest);
      if (pageId === p.id) setPageId(rest[Math.min(index, rest.length - 1)]?.id ?? null);
    } catch (err) {
      report(err);
    }
  }

  function changeTitle(title: string) {
    if (!page) return;
    setPage({ ...page, title });
    setPages((list) => list.map((p) => (p.id === page.id ? { ...p, title } : p)));
    queueSave(page.id, { title });
  }

  const changeContent = useCallback(
    (html: string) => {
      if (pageId) queueSave(pageId, { content: html });
    },
    [pageId, queueSave],
  );

  async function downloadPage() {
    if (!page) return;
    await flush();
    window.location.href = `/api/pages/${page.id}/export`;
  }

  // ---- Files ----
  /** Uploads one file straight to Blob storage and records it on the page. */
  const sendFile = useCallback(
    async (targetId: string, file: File, inline: boolean, onProgress?: (percent: number) => void) => {
      const pathname = `${user.id}/${targetId}/${safeFileName(file.name)}`;
      const { clientToken } = await api<{ clientToken: string }>('/api/blob/upload', {
        method: 'POST',
        json: { pageId: targetId, pathname },
      });
      const blob = await put(pathname, file, {
        access: blobAccess,
        token: clientToken,
        multipart: file.size > 10 * 1024 * 1024,
        onUploadProgress: onProgress && (({ percentage }) => onProgress(Math.round(percentage))),
      });
      return api<Attachment>('/api/attachments', {
        method: 'POST',
        json: { pageId: targetId, pathname: blob.pathname, name: file.name, inline },
      });
    },
    [user.id, blobAccess],
  );

  const uploadImage = useCallback(
    async (file: File) => {
      if (!pageId) throw new Error('No page is open');
      const saved = await sendFile(pageId, file, true);
      return `/api/attachments/${saved.id}?inline=1`;
    },
    [pageId, sendFile],
  );

  const imageFailed = useCallback(
    (err: unknown) => report(new Error(`Image upload failed: ${(err as Error).message}`)),
    [report],
  );

  async function uploadFiles(files: File[]) {
    if (!page || !files.length) return;
    const targetId = page.id;
    await Promise.all(
      files.map(async (file) => {
        const key = `${Date.now()}-${Math.random()}`;
        setUploads((list) => [...list, { key, name: file.name, percent: 0 }]);
        try {
          const saved = await sendFile(targetId, file, false, (percent) =>
            setUploads((list) => list.map((u) => (u.key === key ? { ...u, percent } : u))),
          );
          setPage((p) => (p && p.id === targetId ? { ...p, attachments: [...p.attachments, saved] } : p));
        } catch (err) {
          report(new Error(`Upload of "${file.name}" failed: ${(err as Error).message}`));
        } finally {
          setUploads((list) => list.filter((u) => u.key !== key));
        }
      }),
    );
  }

  async function deleteAttachment(a: Attachment) {
    if (!window.confirm(`Delete the file "${a.name}"?`)) return;
    try {
      await api(`/api/attachments/${a.id}`, { method: 'DELETE' });
      setPage((p) => (p ? { ...p, attachments: p.attachments.filter((x) => x.id !== a.id) } : p));
    } catch (err) {
      report(err);
    }
  }

  async function logout() {
    await flush();
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const currentNotebook = notebooks.find((n) => n.id === notebookId);
  const currentSection = currentNotebook?.sections.find((s) => s.id === sectionId);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">N</span> Notes
        </div>
        <div className="topbar-right">
          <span className={`save-state ${saveState}`}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'All changes saved' : saveState === 'error' ? 'Not saved' : ''}
          </span>
          <span className="muted small hide-sm">{user.email}</span>
          <button className="btn btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <div className="toast" role="alert" onClick={() => setError('')}>
          {error}
        </div>
      )}

      <div className={`panes view-${view}`}>
        {/* Notebooks & sections */}
        <aside className="pane nav-pane">
          <div className="pane-head">
            <h2>Notebooks</h2>
            <button className="icon-btn" title="New notebook" aria-label="New notebook" onClick={addNotebook}>
              <PlusIcon />
            </button>
          </div>
          <div className="pane-scroll">
            {loading && <p className="muted pad">Loading…</p>}
            {!loading && !notebooks.length && (
              <div className="empty pad">
                <p>You don&apos;t have any notebooks yet.</p>
                <button className="btn btn-primary" onClick={addNotebook}>
                  Create a notebook
                </button>
              </div>
            )}
            {notebooks.map((nb) => (
              <div key={nb.id} className={`notebook ${nb.id === notebookId ? 'open' : ''}`}>
                <div className="row notebook-row">
                  <button className="row-main" onClick={() => selectNotebook(nb)}>
                    <BookIcon /> <span className="truncate">{nb.name}</span>
                  </button>
                  <div className="row-actions">
                    <button className="icon-btn" title="New section" aria-label="New section" onClick={() => addSection(nb)}>
                      <PlusIcon />
                    </button>
                    <button className="icon-btn" title="Rename notebook" aria-label="Rename notebook" onClick={() => renameNotebook(nb)}>
                      <PencilIcon />
                    </button>
                    <button className="icon-btn danger" title="Delete notebook" aria-label="Delete notebook" onClick={() => deleteNotebook(nb)}>
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                {nb.id === notebookId && (
                  <div className="sections">
                    {nb.sections.map((s) => (
                      <div key={s.id} className={`row section-row ${s.id === sectionId ? 'selected' : ''}`}>
                        <button className="row-main" onClick={() => selectSection(nb.id, s.id)}>
                          <span className="tab-dot" /> <span className="truncate">{s.name}</span>
                        </button>
                        <div className="row-actions">
                          <button className="icon-btn" title="Rename section" aria-label="Rename section" onClick={() => renameSection(nb, s)}>
                            <PencilIcon />
                          </button>
                          <button className="icon-btn danger" title="Delete section" aria-label="Delete section" onClick={() => deleteSection(nb, s)}>
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button className="add-row" onClick={() => addSection(nb)}>
                      <PlusIcon /> Add section
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Pages */}
        <aside className="pane pages-pane">
          <div className="pane-head">
            <button className="icon-btn mobile-only" aria-label="Back to notebooks" onClick={() => setView('notebooks')}>
              <BackIcon />
            </button>
            <h2 className="truncate">{currentSection?.name ?? 'Pages'}</h2>
            <button className="icon-btn" title="New page" aria-label="New page" disabled={!sectionId} onClick={addPage}>
              <PlusIcon />
            </button>
          </div>
          <div className="pane-scroll">
            {!sectionId && <p className="muted pad">Pick a section to see its pages.</p>}
            {sectionId && !pages.length && (
              <div className="empty pad">
                <p>No pages in this section.</p>
                <button className="btn btn-primary" onClick={addPage}>
                  Add a page
                </button>
              </div>
            )}
            {pages.map((p) => (
              <div key={p.id} className={`row page-row ${p.id === pageId ? 'selected' : ''}`}>
                <button className="row-main page-main" onClick={() => selectPage(p.id)}>
                  <span className="truncate page-title">{p.title || 'Untitled page'}</span>
                  <span className="muted small">{formatDate(p.updated_at)}</span>
                </button>
                <div className="row-actions">
                  <button className="icon-btn danger" title="Delete page" aria-label="Delete page" onClick={() => deletePage(p)}>
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Page editor */}
        <main
          className={`pane page-pane ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            if (page && e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDragging(false);
          }}
          onDrop={(e) => {
            setDragging(false);
            // Images dropped into the text are handled by the editor.
            if (e.defaultPrevented || !page || !e.dataTransfer.files.length) return;
            e.preventDefault();
            void uploadFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <div className="page-head mobile-only">
            <button className="icon-btn" aria-label="Back to pages" onClick={() => setView('pages')}>
              <BackIcon />
            </button>
          </div>
          {!pageId && <div className="placeholder muted">Select or create a page to start writing.</div>}
          {pageId && !page && <div className="placeholder muted">Loading page…</div>}
          {page && (
            <div className="page">
              <input
                className="page-title-input"
                value={page.title}
                placeholder="Page title"
                onChange={(e) => changeTitle(e.target.value)}
                aria-label="Page title"
              />
              <div className="page-meta">
                <span className="muted small">{formatDate(page.updated_at)}</span>
                <div className="page-actions">
                  <button className="btn btn-ghost" onClick={() => fileInput.current?.click()}>
                    <UploadIcon /> Upload files
                  </button>
                  <button className="btn btn-ghost" onClick={downloadPage}>
                    <DownloadIcon /> Download page
                  </button>
                </div>
              </div>

              <Editor
                key={page.id}
                content={page.content}
                onChange={changeContent}
                onImageUpload={uploadImage}
                onError={imageFailed}
              />

              <section className="attachments">
                <h3>
                  <ClipIcon /> Files <span className="muted">({page.attachments.length})</span>
                </h3>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    void uploadFiles(Array.from(e.target.files ?? []));
                    e.target.value = '';
                  }}
                />
                {uploads.map((u) => (
                  <div key={u.key} className="file uploading">
                    <span className="truncate">{u.name}</span>
                    <div className="progress">
                      <div style={{ width: `${u.percent}%` }} />
                    </div>
                    <span className="muted small">{u.percent}%</span>
                  </div>
                ))}
                {page.attachments.map((a) => (
                  <div key={a.id} className="file">
                    <FileIcon />
                    <span className="truncate file-name" title={a.name}>
                      {a.name}
                    </span>
                    <span className="muted small">{formatSize(a.size)}</span>
                    <a className="icon-btn" href={`/api/attachments/${a.id}`} download={a.name} title="Download" aria-label={`Download ${a.name}`}>
                      <DownloadIcon />
                    </a>
                    <button className="icon-btn danger" title="Delete" aria-label={`Delete ${a.name}`} onClick={() => deleteAttachment(a)}>
                      <TrashIcon />
                    </button>
                  </div>
                ))}
                <button className="dropzone" onClick={() => fileInput.current?.click()}>
                  Drop files here or click to upload
                </button>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ---- Icons ----
function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const PlusIcon = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
const PencilIcon = () => <Svg><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Svg>;
const TrashIcon = () => <Svg><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></Svg>;
const DownloadIcon = () => <Svg><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></Svg>;
const UploadIcon = () => <Svg><path d="M12 21V9M7 14l5-5 5 5M5 3h14" /></Svg>;
const BookIcon = () => <Svg><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></Svg>;
const ClipIcon = () => <Svg><path d="m21 11-8.6 8.6a5 5 0 0 1-7-7l8.5-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.3-2.4l7.9-7.9" /></Svg>;
const FileIcon = () => <Svg><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6" /></Svg>;
const BackIcon = () => <Svg><path d="M15 18l-6-6 6-6" /></Svg>;
