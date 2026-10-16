import { useEffect } from "react";
import { LOGOUT_CONFIRM_MESSAGE } from "../../lib/confirmLogout";

export function LogoutConfirmDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="desk-overlay z-[80]"
      data-logout-confirm="true"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-confirm-title"
      onClick={onCancel}
    >
      <div
        className="desk-sheet desk-sheet-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="logout-confirm-title" className="text-lg font-extrabold">
          Log out?
        </h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">{LOGOUT_CONFIRM_MESSAGE}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-xl border border-[var(--border)] text-sm font-semibold"
            data-logout-confirm-no="true"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-11 rounded-xl bg-rose-500 text-sm font-semibold text-white"
            data-logout-confirm-yes="true"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
