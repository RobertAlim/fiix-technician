// src/hooks/useApi.ts
import { useMemo } from "react";
import { useAuth } from "@clerk/expo";
import { createApiClient } from "@/lib/api";

/** Returns a memoized API client bound to the current Clerk session. */
export function useApi() {
  const { getToken } = useAuth();
  return useMemo(() => createApiClient(getToken), [getToken]);
}
