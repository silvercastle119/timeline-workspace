type MobileToggleProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function MobileToggle({ label, checked, onChange, disabled }: MobileToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex min-h-11 w-full items-center justify-between gap-3 py-1 text-left text-sm disabled:cursor-not-allowed ${
        disabled ? "opacity-40" : ""
      }`}
    >
      <span>{label}</span>
      <span
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-zinc-300"
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-7" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}
