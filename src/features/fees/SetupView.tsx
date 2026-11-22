"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { Select } from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { academicSessionsQuery, sessionTermsQuery } from "@/features/academics/sessions-api";
import { levelsQuery } from "@/features/academics/api";
import { refusalText } from "@/features/students/refusal";
import { newActionKey } from "@/lib/api/idempotency";
import { formatNaira } from "@/lib/format/money";
import { useFeeAccess } from "./access";
import {
  activateStructure,
  approveDiscount,
  createDiscount,
  createFeeItem,
  createStructure,
  discountsQuery,
  feeItemsQuery,
  grantDiscount,
  saveStructureLines,
  structuresQuery,
  type DiscountView,
  type FeeItemView,
  type StructureView,
  type StudentDiscountView,
} from "./api";
import {
  DISCOUNT_KINDS,
  FEE_CATEGORIES,
  discountValueProblem,
  koboToNairaText,
  nairaToKobo,
  structureLinesProblems,
  type StructureLineDraft,
} from "./rules";

/** Fee items, fee structures (draft, then activated), and discounts with grants and approval. */
export function SetupView() {
  const t = useTranslations("fees");
  const tState = useTranslations("academics.state");
  const access = useFeeAccess();
  const items = useQuery({
    ...feeItemsQuery(),
    enabled: access.canReports || access.canStructures,
  });
  const structures = useQuery({
    ...structuresQuery(),
    enabled: access.canReports || access.canStructures,
  });
  const discounts = useQuery({
    ...discountsQuery(),
    enabled: access.canReports || access.canStructures,
  });

  if (access.loading) return <SkeletonList rows={3} label={tState("loading")} />;
  if (!access.canStructures && !access.canReports)
    return <EmptyState title={t("noAccessTitle")} description={t("noAccessBody")} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("setup.title")} description={t("setup.intro")} />
      <ItemsSection
        items={items.data ?? []}
        loading={items.isPending}
        canManage={access.canStructures}
      />
      <StructuresSection
        structures={structures.data ?? []}
        items={items.data ?? []}
        loading={structures.isPending}
        canManage={access.canStructures}
      />
      <DiscountsSection
        discounts={discounts.data ?? []}
        loading={discounts.isPending}
        canManage={access.canStructures}
        canApprove={access.canDiscountApprove}
      />
    </div>
  );
}

function ItemsSection({
  items,
  loading,
  canManage,
}: {
  items: FeeItemView[];
  loading: boolean;
  canManage: boolean;
}) {
  const t = useTranslations("fees");
  const tState = useTranslations("academics.state");
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(FEE_CATEGORIES[0]);
  const [mandatory, setMandatory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (name.trim() === "") {
      setMessage(t("setup.nameRequired"));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await createFeeItem({
        name: name.trim(),
        category: category as (typeof FEE_CATEGORIES)[number],
        isMandatoryDefault: mandatory,
      });
      setName("");
      await qc.invalidateQueries({ queryKey: ["fee-items"] });
      toast({ tone: "success", title: t("setup.itemSaved") });
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<FeeItemView>[] = [
    { key: "name", header: t("setup.name"), cell: (i) => i.name },
    { key: "category", header: t("setup.category"), cell: (i) => i.category },
    {
      key: "mandatory",
      header: t("setup.mandatory"),
      cell: (i) => (i.isMandatoryDefault ? t("setup.yes") : t("setup.no")),
    },
  ];

  return (
    <Card className="flex flex-col gap-5">
      <CardTitle>{t("setup.items")}</CardTitle>
      {loading ? (
        <SkeletonList rows={2} label={tState("loading")} />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("setup.noItems")}</p>
      ) : (
        <ResponsiveTable
          caption={t("setup.items")}
          columns={columns}
          rows={items}
          rowKey={(i) => i.id}
        />
      )}
      {canManage ? (
        <form
          onSubmit={add}
          noValidate
          className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"
        >
          <Input
            label={t("setup.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
          <Select
            label={t("setup.category")}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {FEE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </Select>
          <Button type="submit" loading={busy} loadingLabel={tState("loading")}>
            {t("setup.addItem")}
          </Button>
          <label className="flex min-h-11 items-center gap-2 text-sm text-foreground sm:col-span-3">
            <input
              type="checkbox"
              className="size-5 accent-brand"
              checked={mandatory}
              onChange={(e) => setMandatory(e.target.checked)}
            />
            {t("setup.mandatoryDefault")}
          </label>
          {message ? (
            <p role="alert" className="text-sm text-danger-foreground sm:col-span-3">
              {message}
            </p>
          ) : null}
        </form>
      ) : null}
    </Card>
  );
}

function StructuresSection({
  structures,
  items,
  loading,
  canManage,
}: {
  structures: StructureView[];
  items: FeeItemView[];
  loading: boolean;
  canManage: boolean;
}) {
  const t = useTranslations("fees");
  const tState = useTranslations("academics.state");
  const qc = useQueryClient();
  const toast = useToast();
  const sessions = useQuery({ ...academicSessionsQuery, enabled: canManage });
  const levels = useQuery({ ...levelsQuery, enabled: canManage });
  const [sessionId, setSessionId] = useState("");
  const [termId, setTermId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [name, setName] = useState("");
  const [lines, setLines] = useState<Array<StructureLineDraft>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const terms = useQuery({
    ...sessionTermsQuery(sessionId),
    enabled: sessionId !== "" && canManage,
  });

  const isDraft = (x: StructureView) => x.status === "Draft";

  async function activate(id: string) {
    setMessage(null);
    try {
      await activateStructure(id);
      await qc.invalidateQueries({ queryKey: ["fee-structures"] });
      toast({ tone: "success", title: t("setup.activated") });
    } catch (err) {
      setMessage(refusalText(err, tState));
    }
  }

  function editLines(x: StructureView) {
    setEditingId(x.id);
    setName(x.name);
    setLines(
      x.lines.map((l) => ({
        feeItemId: l.feeItemId,
        amount: koboToNairaText(Number(l.amountKobo)),
        isOptional: l.isOptional,
      })),
    );
  }

  const columns: Column<StructureView>[] = [
    { key: "name", header: t("setup.name"), cell: (s) => s.name },
    {
      key: "status",
      header: t("setup.status"),
      cell: (s) => (
        <StatusBadge tone={s.status === "Active" ? "success" : "neutral"}>{s.status}</StatusBadge>
      ),
    },
    { key: "total", header: t("setup.total"), cell: (s) => formatNaira(Number(s.totalKobo)) },
    {
      key: "actions",
      header: t("setup.actions"),
      cell: (s) =>
        canManage && isDraft(s) ? (
          <span className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => editLines(s)}>
              {t("setup.editLines")}
            </Button>
            <Button variant="secondary" onClick={() => void activate(s.id)}>
              {t("setup.activate")}
            </Button>
          </span>
        ) : (
          "—"
        ),
    },
  ];

  async function create(e: FormEvent) {
    e.preventDefault();
    const problems = structureLinesProblems(lines);
    if (editingId !== null) {
      if (problems.length > 0 || lines.length === 0) {
        setMessage(
          problems.length > 0
            ? t(`setup.lineErrors.${problems[0]}`)
            : t("setup.structureIncomplete"),
        );
        return;
      }
      setBusy(true);
      setMessage(null);
      try {
        await saveStructureLines(
          editingId,
          lines.map((l) => ({
            feeItemId: l.feeItemId,
            amountKobo: nairaToKobo(l.amount) ?? 0,
            isOptional: l.isOptional,
          })),
        );
        setEditingId(null);
        setLines([]);
        setName("");
        await qc.invalidateQueries({ queryKey: ["fee-structures"] });
        toast({ tone: "success", title: t("setup.linesSaved") });
      } catch (err) {
        setMessage(refusalText(err, tState));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (
      name.trim() === "" ||
      sessionId === "" ||
      levelId === "" ||
      lines.length === 0 ||
      problems.length > 0
    ) {
      setMessage(
        problems.length > 0 ? t(`setup.lineErrors.${problems[0]}`) : t("setup.structureIncomplete"),
      );
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await createStructure({
        sessionId,
        termId: termId === "" ? null : termId,
        classLevelId: levelId,
        name: name.trim(),
        lines: lines.map((l) => ({
          feeItemId: l.feeItemId,
          amountKobo: nairaToKobo(l.amount) ?? 0,
          isOptional: l.isOptional,
        })),
      });
      setName("");
      setLines([]);
      await qc.invalidateQueries({ queryKey: ["fee-structures"] });
      toast({ tone: "success", title: t("setup.structureSaved") });
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <CardTitle>{t("setup.structures")}</CardTitle>
      {loading ? (
        <SkeletonList rows={2} label={tState("loading")} />
      ) : structures.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("setup.noStructures")}</p>
      ) : (
        <ResponsiveTable
          caption={t("setup.structures")}
          columns={columns}
          rows={structures}
          rowKey={(s) => s.id}
        />
      )}
      {canManage ? (
        <form onSubmit={create} noValidate className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t("setup.name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
            <Select
              label={t("setup.session")}
              value={sessionId}
              onChange={(e) => {
                setSessionId(e.target.value);
                setTermId("");
              }}
            >
              <option value="">{t("setup.choose")}</option>
              {(sessions.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select
              label={t("setup.term")}
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
            >
              <option value="">{t("setup.wholeSession")}</option>
              {(terms.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            <Select
              label={t("setup.level")}
              value={levelId}
              onChange={(e) => setLevelId(e.target.value)}
            >
              <option value="">{t("setup.choose")}</option>
              {(levels.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-foreground">{t("setup.lines")}</p>
            {lines.map((line, i) => (
              <div
                key={i}
                className="grid gap-3 rounded-control border border-border p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto_auto] sm:items-end"
              >
                <Select
                  label={t("setup.item")}
                  value={line.feeItemId}
                  onChange={(e) =>
                    setLines(
                      lines.map((l, j) => (j === i ? { ...l, feeItemId: e.target.value } : l)),
                    )
                  }
                >
                  <option value="">{t("setup.choose")}</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </Select>
                <Input
                  label={t("setup.amount")}
                  inputMode="decimal"
                  value={line.amount}
                  onChange={(e) =>
                    setLines(lines.map((l, j) => (j === i ? { ...l, amount: e.target.value } : l)))
                  }
                />
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-brand"
                    checked={line.isOptional}
                    onChange={(e) =>
                      setLines(
                        lines.map((l, j) => (j === i ? { ...l, isOptional: e.target.checked } : l)),
                      )
                    }
                  />
                  {t("setup.optional")}
                </label>
                <Button variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  {t("setup.remove")}
                </Button>
              </div>
            ))}
            <div>
              <Button
                variant="secondary"
                onClick={() =>
                  setLines([...lines, { feeItemId: "", amount: "", isOptional: false }])
                }
                disabled={items.length === 0}
              >
                {t("setup.addLine")}
              </Button>
            </div>
          </div>
          {message ? (
            <p role="alert" className="text-sm text-danger-foreground">
              {message}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" loading={busy} loadingLabel={tState("loading")}>
              {editingId !== null ? t("setup.saveLines") : t("setup.saveStructure")}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}

function DiscountsSection({
  discounts,
  loading,
  canManage,
  canApprove,
}: {
  discounts: DiscountView[];
  loading: boolean;
  canManage: boolean;
  canApprove: boolean;
}) {
  const t = useTranslations("fees");
  const tState = useTranslations("academics.state");
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>(DISCOUNT_KINDS[0]);
  const [value, setValue] = useState("");
  const [needsApproval, setNeedsApproval] = useState(true);
  const [studentId, setStudentId] = useState("");
  const [discountId, setDiscountId] = useState("");
  const [grantTerm, setGrantTerm] = useState("");
  const [grant, setGrant] = useState<StudentDiscountView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [grantKey, setGrantKey] = useState(() => newActionKey());

  async function add(e: FormEvent) {
    e.preventDefault();
    const problem = name.trim() === "" ? "nameRequired" : discountValueProblem(kind, value);
    if (problem) {
      setMessage(t(`setup.discountErrors.${problem}`));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const n = kind === "Percentage" ? Number(value) : (nairaToKobo(value) ?? 0);
      await createDiscount({
        name: name.trim(),
        kind: kind as (typeof DISCOUNT_KINDS)[number],
        value: n,
        requiresApproval: needsApproval,
      });
      setName("");
      setValue("");
      await qc.invalidateQueries({ queryKey: ["fee-discounts"] });
      toast({ tone: "success", title: t("setup.discountSaved") });
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  async function grantIt(e: FormEvent) {
    e.preventDefault();
    if (studentId.trim() === "" || discountId === "") {
      setMessage(t("setup.grantIncomplete"));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await grantDiscount(
        studentId.trim(),
        discountId,
        grantTerm === "" ? null : grantTerm,
        grantKey,
      );
      setGrant(result);
      setGrantKey(newActionKey());
      toast({ tone: "success", title: t("setup.granted") });
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (grant === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const approved = await approveDiscount(grant.studentId, grant.id);
      setGrant(approved);
      toast({ tone: "success", title: t("setup.approved") });
    } catch (err) {
      setMessage(refusalText(err, tState));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <CardTitle>{t("setup.discounts")}</CardTitle>
      {loading ? (
        <SkeletonList rows={2} label={tState("loading")} />
      ) : discounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("setup.noDiscounts")}</p>
      ) : (
        <ResponsiveTable
          caption={t("setup.discounts")}
          columns={[
            { key: "name", header: t("setup.name"), cell: (d) => d.name },
            { key: "kind", header: t("setup.kind"), cell: (d) => d.kind },
            {
              key: "value",
              header: t("setup.value"),
              cell: (d) =>
                d.kind === "Percentage" ? `${Number(d.value)}%` : formatNaira(Number(d.value)),
            },
            {
              key: "approval",
              header: t("setup.approval"),
              cell: (d) => (d.requiresApproval ? t("setup.yes") : t("setup.no")),
            },
          ]}
          rows={discounts}
          rowKey={(d) => d.id}
        />
      )}
      {canManage ? (
        <form onSubmit={add} noValidate className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t("setup.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
          <Select label={t("setup.kind")} value={kind} onChange={(e) => setKind(e.target.value)}>
            {DISCOUNT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </Select>
          <Input
            label={kind === "Percentage" ? t("setup.percent") : t("setup.amount")}
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-brand"
              checked={needsApproval}
              onChange={(e) => setNeedsApproval(e.target.checked)}
            />
            {t("setup.needsApproval")}
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" loading={busy} loadingLabel={tState("loading")}>
              {t("setup.addDiscount")}
            </Button>
          </div>
        </form>
      ) : null}

      {canManage ? (
        <form
          onSubmit={grantIt}
          noValidate
          className="grid gap-4 rounded-control border border-border p-4 sm:grid-cols-2"
        >
          <p className="sm:col-span-2 text-sm font-semibold text-foreground">{t("setup.grant")}</p>
          <Input
            label={t("setup.studentId")}
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            hint={t("setup.studentIdHint")}
          />
          <Select
            label={t("setup.discount")}
            value={discountId}
            onChange={(e) => setDiscountId(e.target.value)}
          >
            <option value="">{t("setup.choose")}</option>
            {discounts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Input
            label={t("setup.grantTerm")}
            value={grantTerm}
            onChange={(e) => setGrantTerm(e.target.value)}
            hint={t("setup.grantTermHint")}
          />
          <div className="flex items-end justify-end">
            <Button type="submit" loading={busy} loadingLabel={tState("loading")}>
              {t("setup.grantAction")}
            </Button>
          </div>
          {grant ? (
            <div
              role="status"
              className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 text-sm"
            >
              <span>{t("setup.grantStatus", { status: grant.status })}</span>
              {canApprove && grant.approvedBy === null ? (
                <Button variant="secondary" onClick={approve} disabled={busy}>
                  {t("setup.approve")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </form>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {message}
        </p>
      ) : null}
    </Card>
  );
}
