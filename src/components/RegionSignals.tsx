"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * The browser's time zone and language, sent with a checkout form.
 *
 * Checkout charges the region the pricing page showed. That used to come
 * only from the price-check cookie, which is now set only with the
 * visitor's consent (lib/consent), so the same two signals travel with
 * the form and the server checks them again. Like the cookie, they can
 * only move a visitor to Standard prices, never to cheaper ones
 * (lib/region): no country, region or price is ever sent.
 *
 * Filled in a layout effect, which runs before any parent's ordinary
 * effect, so a form that submits itself on load (ContinueCheckout)
 * already carries them.
 */
export function RegionSignals() {
  const timeZone = useRef<HTMLInputElement>(null);
  const language = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (timeZone.current) timeZone.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    if (language.current) language.current.value = navigator.language ?? "";
  }, []);
  return (
    <>
      <input ref={timeZone} type="hidden" name="timeZone" defaultValue="" />
      <input ref={language} type="hidden" name="language" defaultValue="" />
    </>
  );
}
