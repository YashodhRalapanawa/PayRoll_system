"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect, useState } from "react";
import { onActivity } from "./api/client";
import { uid } from "./format";
import type {
  Activity, Attendance, Branch, Company, Department, Designation, Employee, Holiday, LeaveRequest,
  LeaveType, Me, PayrollRun, PayrollSettings, SalaryStructure, Shift, User,
} from "./types";

/**
 * Client data store.
 *
 * Server data (Developer A: organization, employees, shifts, attendance,
 * activity, company, current user) is loaded from /api/bootstrap after sign-in
 * and is never written to browser storage. Writes go through lib/api/hr.ts,
 * which updates this store only after the server accepts them.
 *
 * Local data (Developer B modules not yet on the backend: leave, salary,
 * payroll, payroll settings) is still kept in localStorage, scoped to the
 * company and cleared on sign-out. B replaces these module by module.
 */
interface ServerCollections {
  branches: Branch[];
  departments: Department[];
  designations: Designation[];
  employees: Employee[];
  shifts: Shift[];
  attendance: Attendance[];
  activities: Activity[];
}
interface LocalCollections {
  leaveTypes: LeaveType[];
  leaveRequests: LeaveRequest[];
  holidays: Holiday[];
  salaryStructures: SalaryStructure[];
  payrollRuns: PayrollRun[];
}
export type Collections = ServerCollections & LocalCollections;
type Key = keyof Collections;
type Item<K extends Key> = Collections[K][number];

export interface BootstrapData extends ServerCollections {
  me: Me;
  company: Company;
}

interface State extends Collections {
  me: Me | null;
  company: Company | null;
  serverReady: boolean;
  settings: PayrollSettings;
  /**
   * TRANSITION (until B4 moves salary structures to the database): employee →
   * local salary structure id. Kept locally because local structure ids are
   * not database ids.
   */
  salaryLinks: Record<string, string>;
  /** Company the local data belongs to; local data is reset if it changes. */
  localCompanyId: string | null;

  hydrateServer: (data: BootstrapData) => void;
  setCompany: (c: Company) => void;
  clearSession: () => void;
  saveSettings: (s: PayrollSettings) => void;
  upsert: <K extends Key>(key: K, item: Item<K>) => void;
  upsertMany: <K extends Key>(key: K, items: Item<K>[]) => void;
  remove: <K extends Key>(key: K, id: string) => void;
  /** Adds an activity locally and records it on the server (for local-only modules). */
  log: (type: Activity["type"], title: string, detail: string) => void;
  pushActivity: (a: Activity) => void;
  resetAll: () => void;
}

const emptyServer: ServerCollections = {
  branches: [], departments: [], designations: [], employees: [], shifts: [], attendance: [], activities: [],
};
const emptyLocal = (): LocalCollections => ({
  leaveTypes: [
    { id: "lt-annual", name: "Annual Leave", daysPerYear: 14, paid: true },
    { id: "lt-casual", name: "Casual Leave", daysPerYear: 7, paid: true },
    { id: "lt-medical", name: "Medical Leave", daysPerYear: 7, paid: true },
    { id: "lt-nopay", name: "No-pay Leave", daysPerYear: 0, paid: false },
  ],
  leaveRequests: [], holidays: [], salaryStructures: [], payrollRuns: [],
});
const defaultSettings: PayrollSettings = { epfEmployee: 8, epfEmployer: 12, etf: 3, payDay: 28, otRate: 1.5 };

const withLinks = (e: Employee, links: Record<string, string>): Employee => ({ ...e, salaryStructureId: links[e.id] ?? e.salaryStructureId });

function trackLinks(links: Record<string, string>, items: Employee[]) {
  const next = { ...links };
  for (const e of items) {
    if (e.salaryStructureId) next[e.id] = e.salaryStructureId;
    else delete next[e.id];
  }
  return next;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...emptyServer,
      ...emptyLocal(),
      me: null,
      company: null,
      serverReady: false,
      settings: defaultSettings,
      salaryLinks: {},
      localCompanyId: null,

      hydrateServer: ({ me, company, ...data }) =>
        set((s) => {
          const sameCompany = s.localCompanyId === me.companyId;
          const links = sameCompany ? s.salaryLinks : {};
          return {
            ...(sameCompany ? {} : { ...emptyLocal(), settings: defaultSettings }),
            ...data,
            employees: data.employees.map((e) => withLinks(e, links)),
            salaryLinks: links,
            localCompanyId: me.companyId,
            me,
            company,
            serverReady: true,
          };
        }),
      setCompany: (company) => set({ company }),
      clearSession: () =>
        set({ ...emptyServer, ...emptyLocal(), settings: defaultSettings, salaryLinks: {}, localCompanyId: null, me: null, company: null, serverReady: false }),
      saveSettings: (settings) => set({ settings }),

      upsert: (key, item) =>
        set((s) => {
          const list = s[key] as { id: string }[];
          const id = (item as { id: string }).id;
          let next = item;
          const patch: Partial<State> = {};
          if (key === "employees") {
            patch.salaryLinks = trackLinks(s.salaryLinks, [item as Employee]);
            next = withLinks(item as Employee, patch.salaryLinks) as typeof item;
          }
          const exists = list.some((x) => x.id === id);
          return { ...patch, [key]: exists ? list.map((x) => (x.id === id ? next : x)) : [...list, next] } as Partial<State>;
        }),
      upsertMany: (key, items) =>
        set((s) => {
          const patch: Partial<State> = {};
          let list = items as { id: string }[];
          if (key === "employees") {
            patch.salaryLinks = trackLinks(s.salaryLinks, items as Employee[]);
            list = (items as Employee[]).map((e) => withLinks(e, patch.salaryLinks!));
          }
          const map = new Map((s[key] as { id: string }[]).map((x) => [x.id, x]));
          for (const it of list) map.set(it.id, it);
          return { ...patch, [key]: [...map.values()] } as Partial<State>;
        }),
      remove: (key, id) => set((s) => ({ [key]: (s[key] as { id: string }[]).filter((x) => x.id !== id) }) as Partial<State>),

      pushActivity: (a) => set((s) => ({ activities: [a, ...s.activities.filter((x) => x.id !== a.id)].slice(0, 50) })),
      log: (type, title, detail) => {
        const temp: Activity = { id: `local-${uid()}`, type, title, detail, at: new Date().toISOString() };
        get().pushActivity(temp);
        fetch("/api/activity", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, title: title.slice(0, 200), detail: detail.slice(0, 1000) }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { activity?: Activity } | null) => {
            if (d?.activity) set((s) => ({ activities: s.activities.map((x) => (x.id === temp.id ? d.activity! : x)) }));
          })
          .catch(() => undefined);
      },
      /** Clears this browser's local (not yet server-backed) module data. */
      resetAll: () => set({ ...emptyLocal(), settings: defaultSettings, salaryLinks: {} }),
    }),
    {
      name: "hr-payroll-store",
      version: 2,
      // Only local-module data is persisted. Server data, the user and the
      // company never touch browser storage.
      partialize: (s) => ({
        leaveTypes: s.leaveTypes,
        leaveRequests: s.leaveRequests,
        holidays: s.holidays,
        salaryStructures: s.salaryStructures,
        payrollRuns: s.payrollRuns,
        settings: s.settings,
        salaryLinks: s.salaryLinks,
        localCompanyId: s.localCompanyId,
      }),
      // v1 stored users with plain-text passwords and all HR data: drop it all.
      migrate: () => ({ ...emptyLocal(), settings: defaultSettings, salaryLinks: {}, localCompanyId: null }) as unknown as State,
    },
  ),
);

onActivity((a) => useStore.getState().pushActivity(a));

/** True once the persisted store has been rehydrated on the client. */
export function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => {
    if (useStore.persist.hasHydrated()) setH(true);
    return useStore.persist.onFinishHydration(() => setH(true));
  }, []);
  return h;
}

export function useCurrentUser(): User | null {
  return useStore((s) => s.me);
}

/** UI permissions mirroring the server rules (the server is still authoritative). */
export function useCan() {
  const role = useStore((s) => s.me?.role);
  return { manageHR: role === "Administrator" || role === "HR Manager", admin: role === "Administrator" };
}

export const empName = (e?: Employee) => (e ? `${e.firstName} ${e.lastName}`.trim() : "Unknown");

export function nextEmpNo(employees: Employee[]) {
  const max = employees.reduce((m, e) => Math.max(m, parseInt(e.empNo.replace(/\D/g, "")) || 0), 0);
  return `EMP${String(max + 1).padStart(3, "0")}`;
}
