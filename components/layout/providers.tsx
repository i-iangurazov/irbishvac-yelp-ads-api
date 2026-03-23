"use client";

import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";

const ReactQueryDevtools =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("@tanstack/react-query-devtools").then((module) => module.ReactQueryDevtools), {
        ssr: false
      })
    : null;

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: 1
          }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster richColors position="top-right" />
      {ReactQueryDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}
