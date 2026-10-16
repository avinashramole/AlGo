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
      className="logout-confirm-scrim"
      data-logout-confirm="true"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-confirm-title"
      onClick={onCancel}
    >
      <div className="logout-confirm-card" onClick={(event) => event.stopPropagation()}>
        <h2 id="logout-confirm-title">Log out?</h2>
        <p>{LOGOUT_CONFIRM_MESSAGE}</p>
        <div className="logout-confirm-actions">
          <button type="button" onClick={onCancel} data-logout-confirm-no="true">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} data-logout-confirm-yes="true">
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
