import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className={`modal ${className}`} aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }}><header className="panel-head"><h2>{title}</h2><button aria-label="关闭对话框" onClick={onClose}>×</button></header><div className="panel-body">{children}</div></dialog>;
}
