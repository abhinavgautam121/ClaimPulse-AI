"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";
import { Toaster } from "sonner";
import { periodFor } from "@/lib/utils";
type Period = { start: string; end: string };
const ReportContext = createContext<{
  period: Period;
  setPeriod: (p: Period) => void;
}>({ period: periodFor(90), setPeriod: () => {} });
export const usePeriod = () => useContext(ReportContext);
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  const [period, setPeriod] = useState<Period>(periodFor(90));
  return (
    <QueryClientProvider client={client}>
      <ReportContext.Provider value={{ period, setPeriod }}>
        {children}
        <Toaster richColors position="bottom-right" />
      </ReportContext.Provider>
    </QueryClientProvider>
  );
}
