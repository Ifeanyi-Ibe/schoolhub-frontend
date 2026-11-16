"use client";

import { useLightTranslations } from "@/i18n/light-provider";
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Dialog } from "./dialog";

export interface PaletteItem {
  id: string;
  label: string;
  /** Extra words that should match (synonyms, module names). */
  keywords?: string[];
  group: string;
  onSelect: () => void;
}

/** Case-insensitive match on label, group and keywords. Every query word must match somewhere. */
export function filterPaletteItems(items: readonly PaletteItem[], query: string): PaletteItem[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  return items.filter((item) => {
    const haystack = [item.label, item.group, ...(item.keywords ?? [])].join(" ").toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

/** Ctrl-K / Cmd-K opens the palette. */
export function isPaletteShortcut(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey">): boolean {
  return (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
}

/**
 * Command palette using the ARIA combobox/listbox pattern: focus stays in the input, the active
 * option is announced with aria-activedescendant, and arrow keys move through results.
 * The body mounts only while open (Radix unmounts dialog content on close), so its query resets
 * without effects.
 */
export function CommandPalette({
  items,
  open,
  onOpenChange,
}: {
  items: readonly PaletteItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useLightTranslations("palette");
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("label")}>
      <PaletteBody items={items} onDone={() => onOpenChange(false)} />
    </Dialog>
  );
}

function PaletteBody({ items, onDone }: { items: readonly PaletteItem[]; onDone: () => void }) {
  const t = useLightTranslations("palette");
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => filterPaletteItems(items, query), [items, query]);

  function choose(index: number) {
    const item = results[index];
    if (!item) return;
    onDone();
    item.onSelect();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active);
    }
  }

  const activeId = results[active] ? `${listId}-${results[active].id}` : undefined;

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        role="combobox"
        aria-label={t("placeholder")}
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        placeholder={t("placeholder")}
        className="min-h-11 w-full rounded-control border border-input-border bg-surface px-3 text-base text-foreground placeholder:text-muted-foreground"
      />
      <ul id={listId} role="listbox" aria-label={t("label")} className="max-h-80 overflow-y-auto">
        {results.length === 0 ? (
          <li role="presentation" className="px-3 py-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </li>
        ) : (
          results.map((item, index) => (
            <li
              key={item.id}
              id={`${listId}-${item.id}`}
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
              className={`flex min-h-11 cursor-pointer items-center justify-between rounded-control px-3 text-sm ${index === active ? "bg-muted text-foreground" : "text-foreground"}`}
            >
              <span>{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.group}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
