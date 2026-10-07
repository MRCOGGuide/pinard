/**
 * Whether the site is open to everyone, and what the sign-up buttons say
 * because of it.
 *
 * Before launch, sign-up takes an invite code or a place on the
 * waitlist, so a button promising "Create an account" sent every
 * visitor without a code to a form that would not let them. The words
 * follow the same switch that opens the door.
 */
export const LAUNCHED = process.env.NEXT_PUBLIC_LAUNCHED === "true";

export const SIGN_UP_LABEL = LAUNCHED ? "Create an account" : "Join the pilot or waitlist";
