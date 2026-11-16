/**
 * "Demo" mark for records created by the demo input layer (task M.7, PRODUCT_VISION.md §7).
 * The flag is set on the server from the API key, never from a request. Text, not colour alone.
 */
export function DemoMark({ show }: { show: boolean | undefined }) {
  if (!show) return null;
  return (
    <span
      className="tag whitespace-nowrap border-[#b07a1f] bg-[#fdf3dc] text-[0.7rem] font-semibold uppercase tracking-wide text-[#5c3a00]"
      title="Created by the demo input layer: synthetic data, not a real case"
      data-testid="demo-mark"
    >
      Demo
    </span>
  );
}
