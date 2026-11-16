/** "Demo" mark on staff screens for cases the demo input layer created (task M.7). Server-tagged, never from a request. */
export function DemoMark({ show }: { show: boolean | undefined }) {
  if (!show) return null;
  return (
    <span className="tag tag-brand" title="Created by the demo input layer with synthetic data" data-testid="demo-mark">
      Demo
    </span>
  );
}
