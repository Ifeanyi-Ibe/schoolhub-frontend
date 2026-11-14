"use client";

import { useLayoutEffect } from "react";
import { setNonce } from "get-nonce";

/**
 * Hands the request's CSP nonce to the libraries that insert <style> elements at run time (the dialog's
 * scroll lock). Without it those elements are blocked by style-src and the browser logs a violation.
 * Runs once on mount, before any dialog can open.
 */
export function CspNonce({ nonce }: { nonce: string | undefined }) {
  useLayoutEffect(() => {
    if (nonce) setNonce(nonce);
  }, [nonce]);
  return null;
}
