"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  RecordPage,
  Role,
  Workspace,
  WorkspaceCollection,
} from "@/lib/domain";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(route: string, body?: unknown): Promise<T> {
  const res = await fetch("/api/" + route, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const result = await res.json().catch(() => ({
    error: "The service did not return a valid response. Try again.",
  }));
  if (!res.ok)
    throw new ApiError(
      result.error || "The request failed. Try again.",
      res.status,
    );
  return result;
}
export type Config = {
  accounts: boolean;
  payments: boolean;
  ai: boolean;
  email: boolean;
  google: boolean;
  magic: boolean;
  razorpay: boolean;
  currency: "USD" | "INR";
};
export type CheckoutDetails = {
  key: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
};
type Context = {
  workspace: Workspace | null;
  config: Config;
  loading: boolean;
  error: string;
  role: Role;
  mutate: (
    route: string,
    input?: Record<string, unknown>,
  ) => Promise<{ url?: string; checkout?: CheckoutDetails }>;
  refresh: () => Promise<void>;
  clearSession: () => void;
  loadMore: (collection: WorkspaceCollection) => Promise<void>;
  pageBusy: Partial<Record<WorkspaceCollection, boolean>>;
  pageErrors: Partial<Record<WorkspaceCollection, string>>;
};
const context = createContext<Context | null>(null);
const initialConfig: Config = {
  accounts: false,
  payments: false,
  ai: false,
  email: false,
  google: false,
  magic: false,
  razorpay: false,
  currency: "INR",
};
export function Provider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config>(initialConfig);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageBusy, setPageBusy] = useState<Context["pageBusy"]>({});
  const [pageErrors, setPageErrors] = useState<Context["pageErrors"]>({});
  const generation = useRef(0);
  const pendingPages = useRef(new Set<WorkspaceCollection>());
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    pendingPages.current.clear();
    setPageBusy({});
    setPageErrors({});
    try {
      const data = await api<Workspace>("workspace?pageSize=50");
      if (version !== generation.current) return;
      setWorkspace(data);
      setError("");
    } catch (e) {
      if (
        version === generation.current &&
        e instanceof ApiError &&
        e.status === 401
      )
        setWorkspace(null);
      throw e;
    }
  }, []);
  useEffect(() => {
    let active = true;
    const version = generation.current;
    async function load() {
      try {
        const c = await api<Config>("config");
        if (!active) return;
        setConfig(c);
        if (c.accounts) {
          try {
            const data = await api<Workspace>("workspace?pageSize=50");
            if (active && version === generation.current) setWorkspace(data);
          } catch (e) {
            if (
              active &&
              version === generation.current &&
              (!(e instanceof ApiError) || e.status !== 401)
            )
              setError(
                e instanceof Error
                  ? e.message
                  : "The workspace could not load.",
              );
          }
        } else
          setError(
            "Account service is temporarily unavailable. Please try again later.",
          );
      } catch {
        if (active) setError("The service did not answer. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);
  const loadMore = async (collection: WorkspaceCollection) => {
    const cursor = workspace?.pages?.[collection]?.nextCursor;
    if (!workspace || !cursor || pendingPages.current.has(collection)) return;
    const version = generation.current;
    const userId = workspace.user.id;
    pendingPages.current.add(collection);
    setPageBusy((current) => ({ ...current, [collection]: true }));
    setPageErrors((current) => ({ ...current, [collection]: "" }));
    try {
      const result = await api<
        RecordPage<Workspace[typeof collection][number]>
      >(
        `workspace/${collection}?pageSize=50&cursor=${encodeURIComponent(cursor)}`,
      );
      if (version !== generation.current) return;
      setWorkspace((current) => {
        if (
          !current ||
          current.user.id !== userId ||
          current.pages?.[collection].nextCursor !== cursor
        )
          return current;
        const ids = new Set(current[collection].map((item) => item.id));
        return {
          ...current,
          [collection]: [
            ...current[collection],
            ...result.items.filter((item) => !ids.has(item.id)),
          ],
          pages: { ...current.pages, [collection]: result.page },
        };
      });
    } catch (error) {
      if (version === generation.current)
        setPageErrors((current) => ({
          ...current,
          [collection]:
            error instanceof Error
              ? error.message
              : "The next page could not load. Try again.",
        }));
    } finally {
      if (version === generation.current) {
        pendingPages.current.delete(collection);
        setPageBusy((current) => ({ ...current, [collection]: false }));
      }
    }
  };
  const mutate = async (route: string, input: Record<string, unknown> = {}) => {
    const result = await api<{ url?: string; checkout?: CheckoutDetails }>(
      route,
      input,
    );
    await refresh();
    return result;
  };
  return (
    <context.Provider
      value={{
        workspace,
        config,
        loading,
        error,
        role: workspace?.user.role || "candidate",
        mutate,
        refresh,
        clearSession: () => {
          generation.current++;
          pendingPages.current.clear();
          setWorkspace(null);
          setPageBusy({});
          setPageErrors({});
        },
        loadMore,
        pageBusy,
        pageErrors,
      }}
    >
      {children}
    </context.Provider>
  );
}
export function useApp() {
  const value = useContext(context);
  if (!value) throw new Error("The app context is missing.");
  return value;
}
