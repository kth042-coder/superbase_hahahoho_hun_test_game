"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons";
import styles from "./ui.module.css";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 닫기 버튼/Esc 허용 여부 */
  dismissible?: boolean;
  wide?: boolean;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 포커스 트랩 + Esc 닫기 (PRD 4 접근성) */
export function Modal({ title, onClose, children, dismissible = true, wide = false }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [dismissible]);

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && dismissible && onClose()}>
      <div
        ref={ref}
        className={`${styles.modal} ${wide ? styles.modalWide : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.modalHeader}>
          <h2 id={titleId} className={styles.modalTitle}>
            {title}
          </h2>
          {dismissible && (
            <button type="button" className={styles.iconButton} onClick={onClose} aria-label="닫기">
              <CloseIcon />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
