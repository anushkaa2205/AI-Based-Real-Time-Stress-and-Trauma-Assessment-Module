/**
 * The language choice now lives on the homepage header (task F.2), so /portal sends people to /.
 * Old links and installed apps that open /portal keep working.
 */
import { redirect } from "next/navigation";

export default function PortalIndex() {
  redirect("/");
}
