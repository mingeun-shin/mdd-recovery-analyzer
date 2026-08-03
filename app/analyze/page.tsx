import { Suspense } from "react";
import { AnalyzeClient } from "@/components/AnalyzeClient";

export default function AnalyzePage() {
  return (
    <Suspense fallback={null}>
      <AnalyzeClient />
    </Suspense>
  );
}
