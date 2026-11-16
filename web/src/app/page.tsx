/**
 * The module has no victim website (PRODUCT_VISION.md §5, decision Q3). NHAA's own systems
 * call the integration API; staff use the dashboards. Until the demo input layer exists
 * (Phase M), / goes to the staff sign-in.
 */
import { redirect } from "next/navigation";

export default function Root() {
  redirect("/login");
}
