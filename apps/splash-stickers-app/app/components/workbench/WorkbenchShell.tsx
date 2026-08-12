import { type ReactNode, useEffect, useRef, useState } from "react";

type Drawer = "context" | "preview" | null;

export function WorkbenchShell({ title, subtitle, context, children, preview, actions }: {
  title: string;
  subtitle?: string;
  context: ReactNode;
  children: ReactNode;
  preview: ReactNode;
  actions?: ReactNode;
}) {
  const [drawer, setDrawer] = useState<Drawer>(null);
  const contextButton = useRef<HTMLButtonElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);

  function closeDrawer() {
    const previous = drawer;
    setDrawer(null);
    requestAnimationFrame(() => {
      if (previous === "context") contextButton.current?.focus();
      if (previous === "preview") previewButton.current?.focus();
    });
  }

  useEffect(() => {
    if (!drawer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const previous = drawer;
      setDrawer(null);
      requestAnimationFrame(() => {
        if (previous === "context") contextButton.current?.focus();
        if (previous === "preview") previewButton.current?.focus();
      });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawer]);

  return (
    <main className="wb-shell">
      <header className="wb-appbar">
        <button ref={contextButton} className="wb-icon-button wb-mobile-only" type="button"
          aria-label="Open project context" aria-expanded={drawer === "context"}
          onClick={() => setDrawer("context")}><span aria-hidden="true">☰</span></button>
        <div className="wb-appbar__title"><strong>{title}</strong>{subtitle ? <span>{subtitle}</span> : null}</div>
        <div className="wb-appbar__actions">
          {actions}
          <button ref={previewButton} className="wb-icon-button wb-mobile-only" type="button"
            aria-label="Open preview and changes" aria-expanded={drawer === "preview"}
            onClick={() => setDrawer("preview")}><span aria-hidden="true">▣</span></button>
        </div>
      </header>

      <div className="wb-layout">
        <aside className="wb-panel wb-panel--context" data-drawer-open={drawer === "context" || undefined} aria-label="Project context">
          <DrawerHeader title="Project" onClose={closeDrawer} />{context}
        </aside>
        <section className="wb-stage" aria-label="Builder workspace">{children}</section>
        <aside className="wb-panel wb-panel--preview" data-drawer-open={drawer === "preview" || undefined} aria-label="Preview and changes">
          <DrawerHeader title="Preview" onClose={closeDrawer} />{preview}
        </aside>
      </div>
      {drawer ? <button className="wb-backdrop" type="button" aria-label="Close panel" onClick={closeDrawer} /> : null}
    </main>
  );
}

function DrawerHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return <div className="wb-drawer-header wb-mobile-only"><strong>{title}</strong>
    <button className="wb-icon-button" type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><span aria-hidden="true">×</span></button>
  </div>;
}
