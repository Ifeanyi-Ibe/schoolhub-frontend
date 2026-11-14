"use client";

import { useTranslations } from "next-intl";
import type { components } from "@/lib/api/schema";

type PermissionArea = components["schemas"]["PermissionArea"];

/**
 * The permission catalogue, grouped by area. A permission the editor does not hold is shown but
 * cannot be changed here (the escalation rule), and says so in text as well as disabled state.
 */
export function PermissionChecklist({
  areas,
  selected,
  mine,
  disabled,
  onToggle,
  legend,
}: {
  areas: readonly PermissionArea[];
  selected: readonly string[];
  mine: readonly string[];
  disabled: boolean;
  onToggle: (permission: string, checked: boolean) => void;
  legend: string;
}) {
  const t = useTranslations("staff.role");
  const chosen = new Set(selected);
  return (
    <fieldset className="flex flex-col gap-4" disabled={disabled}>
      <legend className="font-display text-lg font-semibold text-foreground">{legend}</legend>
      {areas.map((area) => (
        <div key={area.area} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">{area.area}</h3>
          {area.permissions.map((p) => {
            const held = mine.includes(p.name);
            return (
              <label key={p.name} className="flex min-h-11 items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-5"
                  checked={chosen.has(p.name)}
                  disabled={disabled || !held}
                  onChange={(e) => onToggle(p.name, e.target.checked)}
                />
                <span className="flex flex-col">
                  <span className="font-mono text-xs text-foreground">{p.name}</span>
                  {held ? null : (
                    <span className="text-xs text-muted-foreground">{t("notHeld")}</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      ))}
    </fieldset>
  );
}
