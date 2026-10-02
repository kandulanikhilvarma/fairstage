"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { demoWorkspace, mutateDemo, seedDemo, type DemoData } from "@/lib/demo";
import type { Role, Workspace } from "@/lib/domain";

export async function api<T>(route: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await res.json();
  if (!res.ok)
    throw new Error(result.error || "The request failed. Try again.");
  return result;
}
type Config = { demo: boolean; payments: boolean; ai: boolean; email: boolean };
type Context = {
  workspace: Workspace | null;
  config: Config;
  loading: boolean;
  error: string;
  role: Role;
  switchRole: (role: Role) => void;
  mutate: (
    route: string,
    input?: Record<string, unknown>,
  ) => Promise<{ url?: string }>;
  refresh: () => Promise<void>;
  reset: () => void;
  demoData: DemoData | null;
};
const context = createContext<Context | null>(null);
const storageKey = "fairstage.demo.v1";
export function Provider({
  children,
  demo,
}: {
  children: ReactNode;
  demo: boolean;
}) {
  const [config, setConfig] = useState<Config>({
    demo,
    payments: false,
    ai: false,
    email: false,
  });
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [demoData, setDemoData] = useState<DemoData | null>(null);
  const [role, setRole] = useState<Role>("employer");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (config.demo) return;
    const data = await api<Workspace>("workspace");
    setWorkspace(data);
    setRole(data.user.role);
  }, [config.demo]);
  useEffect(() => {
    let active = true;
    api<Config>("config")
      .then(async (c) => {
        if (!active) return;
        setConfig(c);
        if (c.demo) {
          let data = seedDemo();
          let selected: Role = "employer";
          try {
            const saved = JSON.parse(
              localStorage.getItem(storageKey) || "null",
            );
            if (
              saved?.data?.users &&
              Array.isArray(saved.data.rounds) &&
              Array.isArray(saved.data.jobs) &&
              Array.isArray(saved.data.ledger) &&
              Array.isArray(saved.data.applications) &&
              Array.isArray(saved.data.disputes)
            ) {
              data = saved.data;
              selected = saved.role === "candidate" ? "candidate" : "employer";
            }
          } catch {}
          if (
            new URLSearchParams(window.location.search).get("role") ===
            "candidate"
          )
            selected = "candidate";
          if (active) {
            setDemoData(data);
            setRole(selected);
            setWorkspace(demoWorkspace(data, selected));
          }
        } else {
          try {
            const data = await api<Workspace>("workspace");
            if (active) {
              setWorkspace(data);
              setRole(data.user.role);
            }
          } catch (e) {
            if (active)
              setError(e instanceof Error ? e.message : "Sign in to continue.");
          }
        }
      })
      .catch(() => {
        if (active) setError("The service did not answer. Refresh the page.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const persist = (data: DemoData, selected: Role) => {
    setDemoData(data);
    setRole(selected);
    setWorkspace(demoWorkspace(data, selected));
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ data, role: selected }),
      );
    } catch {
      setError(
        "The browser could not save the demo. Changes last for this visit only.",
      );
    }
  };
  const switchRole = (selected: Role) => {
    if (config.demo && demoData) persist(demoData, selected);
  };
  const mutate = async (route: string, input: Record<string, unknown> = {}) => {
    if (config.demo) {
      if (!demoData) throw new Error("The demo is not ready. Try again.");
      persist(mutateDemo(demoData, role, route, input), role);
      return {};
    }
    const result = await api<{ url?: string }>(route, input);
    await refresh();
    return result;
  };
  const reset = () => {
    if (config.demo) persist(seedDemo(), "employer");
  };
  return (
    <context.Provider
      value={{
        workspace,
        config,
        loading,
        error,
        role,
        switchRole,
        mutate,
        refresh,
        reset,
        demoData,
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
