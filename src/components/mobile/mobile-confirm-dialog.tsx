type MobileConfirmDialogProps = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function MobileConfirmDialog({
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  danger,
  onConfirm,
  onCancel,
}: MobileConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onCancel}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        {description && (
          <p className="mt-2 whitespace-pre-line text-sm text-zinc-600">{description}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
