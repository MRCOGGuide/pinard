/**
 * Cookie consent (owner's decision, 10 October 2026).
 *
 * Pinard's cookies are strictly necessary, bar one: pinard_price_check,
 * which remembers the pricing page's browser check between visits. That
 * one is set only after "Accept". Rejecting costs nothing but a moment's
 * loading on the pricing page, because the check simply runs again on
 * each visit (and again at checkout), so the price charged is still the
 * price shown.
 *
 * The choice itself is kept in pinard_consent, which is strictly
 * necessary: it is how the banner knows not to ask again. Six months,
 * after which the banner asks again, as the Irish regulator advises.
 */
export const CONSENT_COOKIE = "pinard_consent";
export type ConsentChoice = "all" | "essential";
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 182;
/** Fired on window to open the banner again (the footer's "Cookie settings"). */
export const CONSENT_EVENT = "pinard:cookie-settings";
