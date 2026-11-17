import { useTranslations } from "next-intl";

/** Page title row for staff screens (plan §9.6): title, one-line lead, optional actions on the right. */
export function PageHeader({ title, lead, children }: { title: string; lead?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        {lead && <p className="page-lead">{lead}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  const t = useTranslations("staff.common");
  return (
    <div className="card overflow-hidden" aria-busy="true" aria-label={t("loading")}>
      <div className="h-10 bg-surface-2" />
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex gap-4">
            {Array.from({ length: cols }, (_, c) => (
              <div key={c} className="skeleton h-4 flex-1" style={{ maxWidth: c === 0 ? "5rem" : undefined }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
