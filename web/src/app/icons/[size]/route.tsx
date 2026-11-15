/** App icons for the manifest (task 9.7), drawn at build time: no image files to maintain. */
import { ImageResponse } from "next/og";

const SIZES = new Set([192, 512]);

export const dynamic = "force-static";
export function generateStaticParams() {
  return [...SIZES].map((size) => ({ size: String(size) }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  // Plain, calm mark: the helpline number on a dark circle, safe-zone padded for maskable icons.
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1f2937" }}>
        <div
          style={{
            width: "72%",
            height: "72%",
            borderRadius: "50%",
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#1f2937",
            fontSize: size * 0.17,
            fontWeight: 700,
          }}
        >
          14566
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
