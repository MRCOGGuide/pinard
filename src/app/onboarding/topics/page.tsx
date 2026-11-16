import { redirect } from "next/navigation";

/**
 * The topic ratings were a page of their own; they are now a survey in a
 * pop-up on Today (owner, 16 November 2026). Kept as an address so a link
 * to it still lands on the survey.
 */
export default function TopicsPage() {
  redirect("/?rate=1");
}
