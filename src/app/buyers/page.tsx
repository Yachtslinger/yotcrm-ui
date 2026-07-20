import { redirect } from "next/navigation";

/**
 * The old Buyers page (filterable list with the long-standing filter crash)
 * is superseded by the unified People view: /clients with category chips.
 * This redirect preserves old bookmarks and muscle memory.
 */
export default function BuyersRedirect() {
  redirect("/clients?category=active_buyer");
}
