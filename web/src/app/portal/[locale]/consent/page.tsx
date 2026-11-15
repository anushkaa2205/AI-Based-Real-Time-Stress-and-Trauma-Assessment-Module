import { Suspense } from "react";
import { ConsentScreen } from "@/components/victim/consent-screen";

export default function ConsentPage() {
  return (
    <Suspense fallback={null}>
      <ConsentScreen />
    </Suspense>
  );
}
