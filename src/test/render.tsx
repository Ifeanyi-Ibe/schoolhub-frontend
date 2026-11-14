// Renders components with the real English catalog and the real toast provider.
import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import messages from "../../messages/en.json";
import { ToastProvider } from "@/components/ui/toast";

export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  return render(
    <NextIntlClientProvider locale="en-NG" messages={messages} timeZone="Africa/Lagos">
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
    options,
  );
}
