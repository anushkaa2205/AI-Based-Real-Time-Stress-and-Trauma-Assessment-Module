/** "Synthetic / demonstration" marking shown on every demo page (PRODUCT_VISION.md §6). */
export function DemoBanner({ children }: { children?: React.ReactNode }) {
  return (
    <div role="note" className="flex flex-wrap items-start gap-x-4 gap-y-1 border border-[#d9b878] border-l-[5px] border-l-[#b07a1f] bg-[#fdf3dc] px-4 py-2.5 text-sm text-[#4a3200]">
      <p className="font-bold uppercase tracking-[0.08em]">Demonstration · synthetic data only</p>
      <p className="min-w-0 flex-1 basis-80">
        {children ??
          "This page plays the part of an NHAA system. It calls the module only through the integration API, with its own demo key. Cases it creates are marked Demo on every staff screen."}
      </p>
    </div>
  );
}
