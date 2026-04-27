"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

type QueryProviderProps = {
  children: React.ReactNode;
};

function logQueryProvider(message: string, details?: Record<string, unknown>): void {
  console.log(`[query-provider] ${message}`, details ?? "");
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () => {
      try {
        logQueryProvider("creating query client");
        return new QueryClient({
          defaultOptions: {
            queries: {
              refetchOnWindowFocus: false,
            },
          },
        });
      } catch (error) {
        console.error("[query-provider] failed to create query client", error);
        return new QueryClient();
      }
    },
  );

  logQueryProvider("rendering query provider");

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
