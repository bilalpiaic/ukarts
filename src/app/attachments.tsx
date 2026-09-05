"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ACCEPT_ATTR, ALLOWED_EXT, MAX_FILE_BYTES, MAX_FILES } from "@/lib/attachment-types";

export interface SavedFile {
  id: string;
  file_name: string;
  mime_type: string;
  file_ext: string;
  byte_size: number;
}

export interface PendingFile {
  key: string;
  file: File;
  url: string;
}

type PreviewTarget = {
  name: string;
  ext: string;
  mime: string;
  href?: string;
  file?: File;
};

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function prettySize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export async function uploadAttachments(
  entityType: string,
  entityId: string,
  files: File[],
): Promise<void> {
  if (!files.length) return;
  const fd = new FormData();
  fd.set("entityType", entityType);
  fd.set("entityId", entityId);
  for (const f of files) fd.append("files", f);
  const res = await fetch("/api/attachments", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Attachment upload failed.");
}

export function usePendingFiles() {
  const [files, setFiles] = useState<PendingFile[]>([]);

  const addFiles = useCallback((list: FileList | File[]) => {
    const incoming = Array.from(list);
    setFiles((cur) => {
      const next = [...cur];
      for (const file of incoming) {
        const ext = extOf(file.name);
        if (!(ALLOWED_EXT as readonly string[]).includes(ext)) continue;
        if (file.size > MAX_FILE_BYTES) continue;
        if (next.length >= MAX_FILES) break;
        next.push({ key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file, url: URL.createObjectURL(file) });
      }
      return next;
    });
  }, []);

  const remove = useCallback((key: string) => {
    setFiles((cur) => {
      const hit = cur.find((f) => f.key === key);
      if (hit) URL.revokeObjectURL(hit.url);
      return cur.filter((f) => f.key !== key);
    });
  }, []);

  const clear = useCallback(() => {
    setFiles((cur) => {
      for (const f of cur) URL.revokeObjectURL(f.url);
      return [];
    });
  }, []);

  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(
    () => () => {
      for (const f of filesRef.current) URL.revokeObjectURL(f.url);
    },
    [],
  );

  return { files, addFiles, remove, clear };
}

/** File picker + chips + instant preview, used on bill / SO / PO / voucher forms. */
export function AttachmentField({
  files,
  onAdd,
  onRemove,
  saved = [],
  onDeleteSaved,
  label = "Attachments",
}: {
  files: PendingFile[];
  onAdd: (list: FileList | File[]) => void;
  onRemove: (key: string) => void;
  saved?: SavedFile[];
  onDeleteSaved?: (id: string) => void | Promise<void>;
  label?: string;
}) {
  const inputId = useId();
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  return (
    <div className="attach-field no-print">
      <label htmlFor={inputId}>{label}</label>
      <p className="attach-hint">
        CSV, Word, Excel, PDF, JPG, PNG, MP3 — up to {MAX_FILES} files, {MAX_FILE_BYTES / 1024 / 1024} MB each.
        Click a file to preview it here.
      </p>
      <input
        id={inputId}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        onChange={(e) => {
          if (e.target.files?.length) onAdd(e.target.files);
          e.target.value = "";
        }}
      />
      {(saved.length > 0 || files.length > 0) && (
        <ul className="attach-chips">
          {saved.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="attach-chip"
                onClick={() =>
                  setPreview({
                    name: s.file_name,
                    ext: s.file_ext,
                    mime: s.mime_type,
                    href: `/api/attachments/${s.id}`,
                  })
                }
              >
                {s.file_name}
                <span className="attach-size">{prettySize(s.byte_size)}</span>
              </button>
              {onDeleteSaved && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${s.file_name}`}
                  onClick={() => {
                    void Promise.resolve(onDeleteSaved(s.id)).catch((e) =>
                      window.alert((e as Error).message),
                    );
                  }}
                >
                  ×
                </button>
              )}
            </li>
          ))}
          {files.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                className="attach-chip"
                onClick={() =>
                  setPreview({
                    name: p.file.name,
                    ext: extOf(p.file.name),
                    mime: p.file.type,
                    file: p.file,
                    href: p.url,
                  })
                }
              >
                {p.file.name}
                <span className="attach-size">{prettySize(p.file.size)}</span>
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${p.file.name}`}
                onClick={() => onRemove(p.key)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {preview && <DocPreview target={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

/** Paperclip on a register row — opens saved files in the same preview popup. */
export function AttachmentChips({
  entityType,
  entityId,
  count,
  defaultOpen = false,
}: {
  entityType: string;
  entityId: string;
  count: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [files, setFiles] = useState<SavedFile[] | null>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!defaultOpen || count <= 0) return;
    let gone = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load files.");
        if (!gone) setFiles(data.files ?? []);
      } catch (e) {
        if (!gone) setErr((e as Error).message);
      }
    })();
    return () => {
      gone = true;
    };
  }, [defaultOpen, count, entityType, entityId]);

  async function load() {
    setOpen(true);
    setErr(null);
    if (files) return;
    try {
      const res = await fetch(
        `/api/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load files.");
      setFiles(data.files ?? []);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (count <= 0) return <span className="muted">—</span>;

  return (
    <div className="attach-inline no-print">
      <button type="button" className="btn-ghost attach-open" onClick={load}>
        {count} file{count === 1 ? "" : "s"}
      </button>
      {open && (
        <div className="attach-pop">
          <div className="attach-pop-head">
            <strong>Attachments</strong>
            <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
          {err && <div className="msg err">{err}</div>}
          {!files && !err && <p className="subtitle">Loading…</p>}
          {files && files.length === 0 && <p className="subtitle">No files.</p>}
          {files && files.length > 0 && (
            <ul className="attach-chips">
              {files.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="attach-chip"
                    onClick={() =>
                      setPreview({
                        name: s.file_name,
                        ext: s.file_ext,
                        mime: s.mime_type,
                        href: `/api/attachments/${s.id}`,
                      })
                    }
                  >
                    {s.file_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {preview && <DocPreview target={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

export function SavedAttachmentList({ files }: { files: SavedFile[] }) {
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  if (files.length === 0) return <p className="subtitle">No files.</p>;
  return (
    <>
      <ul className="attach-chips">
        {files.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className="attach-chip"
              onClick={() =>
                setPreview({
                  name: s.file_name,
                  ext: s.file_ext,
                  mime: s.mime_type,
                  href: `/api/attachments/${s.id}`,
                })
              }
            >
              {s.file_name}
              <span className="attach-size">{prettySize(s.byte_size)}</span>
            </button>
          </li>
        ))}
      </ul>
      {preview && <DocPreview target={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

function DocPreview({ target, onClose }: { target: PreviewTarget; onClose: () => void }) {
  const [body, setBody] = useState<ReactNode>(<p className="subtitle">Opening…</p>);

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const node = await renderPreview(target);
        if (!gone) setBody(node);
      } catch (e) {
        if (!gone) setBody(<p className="msg err">{(e as Error).message}</p>);
      }
    })();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      gone = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [target, onClose]);

  const downloadHref = target.href
    ? target.href.includes("?")
      ? `${target.href}&download=1`
      : `${target.href}?download=1`
    : target.file
      ? URL.createObjectURL(target.file)
      : undefined;

  return (
    <div className="preview-modal no-print" role="dialog" aria-modal="true" aria-label={target.name}>
      <div className="preview-dialog">
        <div className="preview-head">
          <div>
            <strong>{target.name}</strong>
            <div className="attach-hint">{target.ext.toUpperCase()} preview</div>
          </div>
          <div className="row-actions">
            {downloadHref && (
              <a className="btn-ghost" href={downloadHref} download={target.name}>
                Download
              </a>
            )}
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="preview-body">{body}</div>
      </div>
    </div>
  );
}

async function renderPreview(target: PreviewTarget): Promise<ReactNode> {
  const ext = target.ext;
  const href = target.href;
  const bytes = target.file ? await target.file.arrayBuffer() : href ? await (await fetch(href)).arrayBuffer() : null;

  if (ext === "png" || ext === "jpg" || ext === "jpeg") {
    const src =
      href ||
      (bytes ? URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: target.mime || "image/jpeg" })) : "");
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={target.name} className="preview-img" />
    );
  }
  if (ext === "pdf") {
    const src = href || (bytes ? URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" })) : "");
    return <iframe className="preview-frame" title={target.name} src={src} />;
  }
  if (ext === "mp3") {
    const src = href || (bytes ? URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" })) : "");
    return <audio className="preview-audio" controls src={src} />;
  }
  if (ext === "csv") {
    const text = bytes ? new TextDecoder().decode(bytes) : "";
    return <CsvTable text={text} />;
  }
  if (ext === "xlsx" && bytes) {
    const table = await xlsxPreview(bytes);
    return table ?? <p className="subtitle">Could not read this spreadsheet. Download to open it in Excel.</p>;
  }
  if (ext === "docx" && bytes) {
    const text = await docxPreview(bytes);
    return text ? (
      <pre className="preview-text">{text}</pre>
    ) : (
      <p className="subtitle">Could not read this Word file. Download to open it.</p>
    );
  }
  if (ext === "xls" || ext === "doc") {
    return (
      <p className="subtitle">
        Instant preview is available for PDF, images, CSV, XLSX, DOCX and MP3. This {ext.toUpperCase()} file is
        attached — use Download to open it.
      </p>
    );
  }
  return <p className="subtitle">No in-browser preview for this type. Use Download.</p>;
}

function CsvTable({ text }: { text: string }) {
  const rows = parseCsv(text).slice(0, 80);
  if (rows.length === 0) return <p className="subtitle">Empty CSV.</p>;
  const width = Math.max(...rows.map((r) => r.length));
  return (
    <div className="preview-table-wrap">
      <table>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {Array.from({ length: width }, (_, c) =>
                i === 0 ? <th key={c}>{r[c] ?? ""}</th> : <td key={c}>{r[c] ?? ""}</td>,
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

async function inflate(raw: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const stream = new Blob([ab]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const u8 = new Uint8Array(buf);
  const view = new DataView(buf);
  const files = new Map<string, Uint8Array>();
  let i = 0;
  while (i + 30 < u8.length) {
    if (view.getUint32(i, true) !== 0x04034b50) break;
    const method = view.getUint16(i + 8, true);
    const compSize = view.getUint32(i + 18, true);
    const nameLen = view.getUint16(i + 26, true);
    const extraLen = view.getUint16(i + 28, true);
    const name = new TextDecoder().decode(u8.slice(i + 30, i + 30 + nameLen));
    const dataStart = i + 30 + nameLen + extraLen;
    const data = u8.slice(dataStart, dataStart + compSize);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, await inflate(data));
    i = dataStart + compSize;
  }
  return files;
}

function xmlText(xml: string): string {
  return xml
    .replace(/<w:p[\s>]/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function docxPreview(buf: ArrayBuffer): Promise<string | null> {
  const zip = await unzip(buf);
  const doc = zip.get("word/document.xml");
  if (!doc) return null;
  return xmlText(new TextDecoder().decode(doc));
}

async function xlsxPreview(buf: ArrayBuffer): Promise<ReactNode | null> {
  const zip = await unzip(buf);
  const ss = zip.get("xl/sharedStrings.xml");
  const sheet = zip.get("xl/worksheets/sheet1.xml") ?? [...zip.keys()].find((k) => k.startsWith("xl/worksheets/sheet"));
  const sheetBytes = typeof sheet === "string" ? zip.get(sheet) : sheet;
  if (!sheetBytes) return null;
  const strings: string[] = [];
  if (ss) {
    const xml = new TextDecoder().decode(ss);
    const re = /<si[\s>][\s\S]*?<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const texts = [...m[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]);
      strings.push(texts.join(""));
    }
  }
  const sheetXml = new TextDecoder().decode(sheetBytes);
  const rows: string[][] = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(sheetXml)) && rows.length < 40) {
    const cells: string[] = [];
    const cellRe = /<c([^>]*)>([\s\S]*?)<\/c>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1];
      const inner = cm[2];
      const v = inner.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const isStr = /\bt="s"/.test(attrs);
      cells.push(isStr ? (strings[Number(v)] ?? v) : v);
    }
    if (cells.some((c) => c !== "")) rows.push(cells);
  }
  if (!rows.length) return null;
  const width = Math.max(...rows.map((r) => r.length));
  return (
    <div className="preview-table-wrap">
      <table>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {Array.from({ length: width }, (_, c) =>
                i === 0 ? <th key={c}>{r[c] ?? ""}</th> : <td key={c}>{r[c] ?? ""}</td>,
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
