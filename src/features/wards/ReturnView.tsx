"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useLightTranslations } from "@/i18n/light-provider";
import { downloadFromApi } from "@/features/files/download";
import { formatNaira } from "@/lib/format/money";
import { paymentOutcome } from "./rules";
import { verifyPaymentQuery } from "./payments";

/**
 * Where the gateway returns the parent. The result comes from the server's verify call, never from the redirect itself.
 * A confirmed payment offers its receipt.
 */
export function PaymentReturnView() {
  const t = useLightTranslations("wards");
  const params = useSearchParams();
  const reference = params.get("reference") ?? "";
  const qc = useQueryClient();
  const [receiptError, setReceiptError] = useState(false);
  const verify = useQuery({
    ...verifyPaymentQuery(reference),
    enabled: reference !== "",
    retry: false,
  });

  if (reference === "") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("returnTitle")} />
        <p role="alert" className="text-sm text-danger-foreground">
          {t("missingReference")}
        </p>
        <Link
          href="/wards"
          className="text-sm font-semibold text-brand underline underline-offset-4"
        >
          {t("back")}
        </Link>
      </div>
    );
  }

  const data = verify.data;
  const outcome = data ? paymentOutcome(data.status) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("returnTitle")} description={t("reference", { reference })} />
      <Card className="flex flex-col gap-4">
        <CardTitle>{outcome === null ? t("checking") : t(outcome)}</CardTitle>
        {verify.isError ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {t("loadError")}
          </p>
        ) : null}
        {data ? (
          <p className="text-sm text-muted-foreground">
            {t("paymentAmount", { amount: formatNaira(Number(data.amountKobo)) })}
          </p>
        ) : null}
        {outcome === "confirmed" && data ? (
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={async () => {
                setReceiptError(false);
                try {
                  await downloadFromApi(
                    `/api/v1/payments/${encodeURIComponent(data.id)}/receipt`,
                    `receipt-${data.receiptNo ?? data.id}.pdf`,
                  );
                } catch {
                  setReceiptError(true);
                }
              }}
            >
              {t("receipt")}
            </Button>
          </div>
        ) : null}
        {receiptError ? (
          <p role="alert" className="text-sm text-danger-foreground">
            {t("loadError")}
          </p>
        ) : null}
        {outcome !== null && outcome !== "confirmed" ? (
          <div>
            <Button
              variant="ghost"
              onClick={() => void qc.invalidateQueries({ queryKey: ["payment-verify", reference] })}
            >
              {t("checkAgain")}
            </Button>
          </div>
        ) : null}
      </Card>
      <Link href="/wards" className="text-sm font-semibold text-brand underline underline-offset-4">
        {t("back")}
      </Link>
    </div>
  );
}
