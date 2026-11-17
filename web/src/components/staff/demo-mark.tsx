import { useTranslations } from "next-intl";

/** "Demo" mark on staff screens for cases the demo input layer created (task M.7). Server-tagged, never from a request. */
export function DemoMark({ show }: { show: boolean | undefined }) {
  const t = useTranslations("staff.common");
  if (!show) return null;
  return (
    <span className="tag tag-brand" title={t("demoTitle")} data-testid="demo-mark">
      {t("demo")}
    </span>
  );
}
