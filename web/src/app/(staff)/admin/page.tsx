/** System administration (task 8.6): users, API clients and scoring versions. */
import { getTranslations } from "next-intl/server";
import { AdminConsole } from "@/components/staff/admin-console";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/staff-session";
import { District } from "@/models";

export default async function Page() {
  await requirePage("admin");
  const t = await getTranslations("staff.pages");
  await db();
  const districts = (await District.find().select("name").sort({ name: 1 }).lean()).map((d) => ({ id: String(d._id), name: d.name }));
  return (
    <section className="flex flex-col gap-4">
      <h1 className="page-title">{t("adminTitle")}</h1>
      <AdminConsole districts={districts} />
    </section>
  );
}
