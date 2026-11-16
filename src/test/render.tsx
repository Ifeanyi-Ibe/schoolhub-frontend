// Renders components with the real English catalog and the real toast provider. Both formatters are
// provided, as in the app: the light one from the root layout, next-intl from the auth and staff layouts.
import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import messages from "../../messages/en.json";
import { LIGHT_MESSAGE_PATHS, pickPaths } from "@/i18n/client-namespaces";
import { LightMessagesProvider } from "@/i18n/light-provider";
import { ToastProvider } from "@/components/ui/toast";

export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  return render(
    <LightMessagesProvider locale="en-NG" messages={pickPaths(messages, LIGHT_MESSAGE_PATHS)}>
      <NextIntlClientProvider locale="en-NG" messages={messages} timeZone="Africa/Lagos">
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </LightMessagesProvider>,
    options,
  );
}
