import { useState } from "react";
import type { BrokerInstallField } from "../../api/client";
import { displayInstallValue } from "../../lib/formSecrets";

const inputClass = "h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm";

export function BrokerInstallFields({
  fields,
  values,
  hints,
  onChange,
  disabled,
}: {
  fields: BrokerInstallField[];
  values: Record<string, string>;
  hints?: Record<string, string>;
  onChange: (id: string, value: string) => void;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState("");
  return (
    <div className="grid gap-3">
      {fields.map((field) => {
        const shown = focused === field.id ? values[field.id] || "" : displayInstallValue(field, values, hints);
        return (
          <label key={field.id} className="block text-xs font-semibold">
            {field.label}
            <input
              className={`${inputClass} mt-1 font-normal`}
              type={field.secret ? "password" : "text"}
              value={shown}
              placeholder={hints?.[field.id] || field.placeholder || field.label}
              autoComplete="off"
              disabled={disabled}
              onFocus={() => setFocused(field.id)}
              onBlur={() => setFocused("")}
              onChange={(event) => onChange(field.id, event.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}
