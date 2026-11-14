"use client";

import { createContext, useContext, type ReactNode } from "react";

/** True when writes are turned off for this school (suspended account, 402 billing.suspended). */
const ReadOnlyContext = createContext(false);

export function ReadOnlyProvider({
  readOnly,
  children,
}: {
  readOnly: boolean;
  children: ReactNode;
}) {
  return <ReadOnlyContext.Provider value={readOnly}>{children}</ReadOnlyContext.Provider>;
}

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}
