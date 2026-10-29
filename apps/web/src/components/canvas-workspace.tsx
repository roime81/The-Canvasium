"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import GridLayout, { type Layout } from "react-grid-layout";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { CanvasPlanSchema, type CanvasBlock, type CanvasPlan, type DataSource } from "@canvasium/types";
import { useCanvasStore } from "@/store/canvas-store";
import { inspectTabularFile } from "@/lib/local-data";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

function EditableText({ block }: { block: Extract<CanvasBlock, { type: "paragraph" | "heading" }> }) {
  const updateText = useCanvasStore((state) => state.updateText);
  const initialContent = block.type === "heading"
    ? `<h${block.level}>${block.content}</h${block.level}>`
    : block.content;
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => updateText(block.id, currentEditor.getHTML()),
    editorProps: { attributes: { class: "prose-editor", "aria-label": "Editable canvas text" } },
  });

  return <EditorContent editor={editor} />;
}

function CanvasBlockView({ block }: { block: CanvasBlock }) {
  const source = useCanvasStore((state) =>
    block.type === "file_attachment" || block.type === "bi_widget"
      ? state.canvas.connectedSources.find((item) =>
        item.id === (block.type === "file_attachment" ? block.sourceId : block.dataSourceId),
      )
      : undefined,
  );
  if (block.type === "paragraph" || block.type === "heading") {
    return <EditableText block={block} />;
  }
  if (block.type === "file_attachment") {
    const size = block.size < 1024 ? `${block.size} B` : `${(block.size / 1024).toFixed(0)} KB`;
    const sourceInfo = source?.kind === "file"
      ? source.status === "ready"
        ? `${source.columns.length} columns parsed locally`
        : source.status === "error"
          ? "Could not read file"
          : source.status === "processing"
            ? "Reading schema in this browser…"
            : "Metadata only"
      : "Metadata only";
    return (
      <article className="canvas-card">
        <span className="card-kicker">ATTACHMENT</span>
        <h2>{block.fileName}</h2>
        <p>{block.mimeType || "Local file"} · {size} · {sourceInfo}</p>
      </article>
    );
  }
  if (block.type === "bi_widget") {
    return (
      <article className="canvas-card">
        <span className="card-kicker">{block.widgetType.replace("_", " ").toUpperCase()}</span>
        <h2>{block.title}</h2>
        <div className="chart-placeholder" role="img" aria-label={`${block.title} chart placeholder`}>
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <p>
          {source
            ? `Source: ${source.name}. Live query rendering is not wired yet.`
            : "Connect a data source to populate this visualization."}
        </p>
      </article>
    );
  }
  return (
    <article className="canvas-card visual-card">
      <span className="card-kicker">VISUAL WORKSPACE</span>
      <div className="visual-placeholder" aria-label="Generated images will appear here">Your images will appear here</div>
      {block.assets.map((asset) => (
        <img key={asset.url} src={asset.url} alt={asset.alt ?? asset.promptPrompted} />
      ))}
    </article>
  );
}

function PromptBar() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const replaceBlocks = useCanvasStore((state) => state.replaceBlocks);
  const sources = useCanvasStore((state) => state.canvas.connectedSources);
  const addSource = useCanvasStore((state) => state.addSource);
  const updateSource = useCanvasStore((state) => state.updateSource);

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = prompt.trim();
    if (!request || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: request, sources }),
      });
      if (!response.ok) throw new Error(`Planner request failed (${response.status}).`);
      const result = await response.json() as { plan: unknown };
      const plan: CanvasPlan = CanvasPlanSchema.parse(result.plan);
      replaceBlocks(plan.blocks, plan.title, plan.activeLayoutMode);
      setPrompt("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The planner could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  async function attachFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const sourceId = `file-${crypto.randomUUID()}`;
    const canInspect = /\.(csv|parquet)$/i.test(file.name);
    const source: DataSource = {
      id: sourceId,
      kind: "file",
      name: file.name,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      status: canInspect ? "processing" : "metadata_only",
      columns: [],
    };
    addSource(source, {
      id: `attachment-${sourceId}`,
      type: "file_attachment",
      sourceId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    });
    event.target.value = "";
    if (canInspect) {
      try {
        const columns = await inspectTabularFile(file, sourceId);
        updateSource({ ...source, status: "ready", columns });
      } catch (reason) {
        updateSource({ ...source, status: "error" });
        setError(reason instanceof Error ? `Could not read ${file.name}: ${reason.message}` : `Could not read ${file.name}.`);
      }
    }
  }

  return (
    <div className="command-wrap">
      {error && <p className="error-message" role="alert">{error}</p>}
      <form className="command-bar" onSubmit={submitPrompt}>
        <label className="attach-button" aria-label="Attach CSV, PDF, or Parquet">
          <input type="file" accept=".csv,.pdf,.parquet,text/csv,application/pdf" onChange={attachFile} />
          <span aria-hidden="true">+</span>
        </label>
        <textarea
          aria-label="Describe what you want to create"
          placeholder="What would you like to make?"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          maxLength={4000}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !prompt.trim()} aria-label="Create canvas">
          {busy ? "…" : "↑"}
        </button>
      </form>
      <p className="command-hint">Enter to create · Shift + Enter for a new line · Attach CSV, PDF, or Parquet</p>
    </div>
  );
}

export function CanvasWorkspace() {
  const title = useCanvasStore((state) => state.canvas.title);
  const blocks = useCanvasStore((state) => state.canvas.blocks);
  const mode = useCanvasStore((state) => state.canvas.activeLayoutMode);
  const updateLayout = useCanvasStore((state) => state.updateLayout);
  const canvasRef = useRef<HTMLElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(1120);
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setCanvasWidth(Math.max(320, Math.floor(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const layout: Layout[] = blocks.map((block, index) => {
    const positioned = "layout" in block ? block.layout : undefined;
    const textBlock = block.type === "paragraph" || block.type === "heading";
    return {
      i: block.id,
      x: positioned?.x ?? (textBlock ? 0 : (index * 4) % 12),
      y: positioned?.y ?? (mode === "document" ? index * 3 : Math.floor((index * 4) / 12) * 3),
      w: positioned?.w ?? (textBlock ? 12 : 4),
      h: positioned?.h ?? 3,
      minW: positioned?.minW ?? 2,
      minH: positioned?.minH ?? 2,
      static: !positioned || mode === "document",
    };
  });

  function saveLayout(next: Layout[]) {
    for (const item of next) {
      const block = blocks.find(({ id }) => id === item.i);
      if (block && ("layout" in block)) {
        updateLayout(block.id, { x: item.x, y: item.y, w: item.w, h: item.h, minW: item.minW, minH: item.minH });
      }
    }
  }

  return (
    <main className="workspace">
      <section ref={canvasRef} className={`canvas canvas-${mode}`} aria-label={title}>
        {blocks.length === 0 ? (
          <div className="empty-state">
            <p className="eyebrow">THE CANVASIUM</p>
            <h1>One canvas.<br />Whatever you need.</h1>
            <p>Start with a prompt to create a document, dashboard, or visual workspace.</p>
          </div>
        ) : (
          <>
            <h1 className="canvas-title">{title}</h1>
            <GridLayout
              className="canvas-grid"
              layout={layout}
              cols={12}
              rowHeight={72}
              width={canvasWidth}
              onLayoutChange={saveLayout}
              isDraggable
              isResizable={mode !== "document"}
              compactType="vertical"
            >
              {blocks.map((block) => (
                <div key={block.id} className="canvas-grid-item">
                  <CanvasBlockView block={block} />
                </div>
              ))}
            </GridLayout>
          </>
        )}
      </section>
      <PromptBar />
    </main>
  );
}
