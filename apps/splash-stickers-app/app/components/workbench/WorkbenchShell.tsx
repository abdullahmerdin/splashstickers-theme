import { type ReactNode, useEffect, useRef, useState } from "react";

export function WorkbenchShell({ title, children, preview }: {
  title: string;
  children: ReactNode;
  preview: ReactNode;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewButton = useRef<HTMLButtonElement>(null);

  function closeDrawer() {
    setPreviewOpen(false);
    requestAnimationFrame(() => previewButton.current?.focus());
  }

  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPreviewOpen(false);
      requestAnimationFrame(() => previewButton.current?.focus());
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [previewOpen]);

  return (
    <main className="wb-shell">
      <header className="wb-appbar">
        <div className="wb-appbar__title"><strong>{title}</strong></div>
        <div className="wb-appbar__actions">
          <button ref={previewButton} className="wb-icon-button wb-mobile-only" type="button"
            data-tour="preview-mobile"
            aria-label="Open preview and order" aria-expanded={previewOpen}
            onClick={() => setPreviewOpen(true)}><span aria-hidden="true">▣</span></button>
        </div>
      </header>

      <div className="wb-layout">
        <section className="wb-stage" aria-label="Builder workspace">{children}</section>
        <aside className="wb-panel wb-panel--preview" data-tour="preview-panel" data-drawer-open={previewOpen || undefined} aria-label="Preview and order">
          <DrawerHeader title="Preview" onClose={closeDrawer} />{preview}
        </aside>
      </div>
      {previewOpen ? <button className="wb-backdrop" type="button" aria-label="Close panel" onClick={closeDrawer} /> : null}
    </main>
  );
}

function DrawerHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return <div className="wb-drawer-header wb-mobile-only"><strong>{title}</strong>
    <button className="wb-icon-button" type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><span aria-hidden="true">×</span></button>
  </div>;
}
