"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CommandPalette,
  isPaletteShortcut,
  type PaletteItem,
} from "@/components/ui/command-palette";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { parseApiProblem } from "@/lib/api/problem";
import { useToast } from "@/components/ui/toast";
import { StickyActionBar } from "@/components/ui/sticky-action-bar";
import { useEffect } from "react";

const ITEMS: PaletteItem[] = [
  {
    id: "students",
    label: "Students",
    group: "Staff",
    keywords: ["learners", "pupils"],
    onSelect: () => undefined,
  },
  {
    id: "fees",
    label: "Fee invoices",
    group: "Bursar",
    keywords: ["billing"],
    onSelect: () => undefined,
  },
  { id: "attendance", label: "Attendance register", group: "Teacher", onSelect: () => undefined },
];

export function StyleguideClient() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPaletteShortcut(e)) {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section aria-labelledby="states" className="flex flex-col gap-4">
      <h2 id="states" className="font-display text-xl font-semibold">
        Feedback and dialogs
      </h2>
      <div className="flex flex-wrap gap-3">
        <Button variant="danger" onClick={() => setDialogOpen(true)}>
          Open dialog
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast({ tone: "success", title: "Saved", description: "Changes are saved." })
          }
        >
          Show toast
        </Button>
        <Button variant="ghost" onClick={() => setPaletteOpen(true)}>
          Open command palette (Ctrl/Cmd K)
        </Button>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Confirm this action?"
        description="This example shows focus management and the destructive pattern."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setDialogOpen(false)}>
              Remove
            </Button>
          </>
        }
      />

      <CommandPalette items={ITEMS} open={paletteOpen} onOpenChange={setPaletteOpen} />

      <ErrorState
        title="We could not save that."
        description="Changed by someone else."
        problem={parseApiProblem(409, {
          code: "concurrency.conflict",
          traceId: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
        })}
        onRetry={() =>
          toast({ tone: "info", title: "Reloading", description: "Fetching the latest version." })
        }
      />

      <div className="relative min-h-24 rounded-card border border-border bg-surface">
        <StickyActionBar label="Form actions (example)">
          <Button variant="ghost">Discard</Button>
          <Button>Save changes</Button>
        </StickyActionBar>
      </div>
    </section>
  );
}
