import type { BrokerInstallField } from "../../api/client";

const inputClass = "h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm";

export function BrokerInstallFields({
  fields,
  values,
  onChange,
  disabled,
}: {
  fields: BrokerInstallField[];
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      {fields.map((field) => (
        <label key={field.id} className="block text-xs font-semibold">
          {field.label}
          <input
            className={`${inputClass} mt-1 font-normal`}
            type={field.secret ? "password" : "text"}
            value={values[field.id] || ""}
            placeholder={field.placeholder || field.label}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => onChange(field.id, event.target.value)}
          />
        </label>
      ))}
    </div>
  );
}
