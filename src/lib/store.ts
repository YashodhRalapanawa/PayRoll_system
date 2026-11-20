"use client";
import { create } from "zustand";
import { onActivity } from "./api/client";
import type {
  Activity, Attendance, Branch, Company, Department, Designation, Employee, Holiday, LeaveRequest,
  LeaveType, Me, PayrollRun, PayrollSettings, SalaryStructure, Shift, User,
} from "./types";

/**
 * In-memory cache of the signed-in user's company data.
 *
 * Everything is loaded from /api/bootstrap after sign-in and every write goes
 * through lib/api/*, which updates this store only after the server accepts
 * the change. Nothing is written to browser storage, and sign-out clears it.
 */
export interface Collections {
  branches: Branch[];
  departments: Department[];
  designations: Designation[];
  employees: Employee[];
  shifts: Shift[];
  attendance: Attendance[];
  activities: Activity[];
  leaveTypes: LeaveType[];
  leaveRequests: LeaveRequest[];
  holidays: Holiday[];
  salaryStructures: SalaryStructure[];
  payrollRuns: PayrollRun[];
}
type Key = keyof Collections;
type Item<K extends Key> = Collections[K][number];

export interface BootstrapData extends Collections {
  me: Me;
  company: Company;
  settings: PayrollSettings;
}

interface State extends Collections {
  me: Me | null;
  company: Company | null;
  settings: PayrollSettings;
  serverReady: boolean;

  hydrateServer: (data: BootstrapData) => void;
  setCompany: (c: Company) => void;
  setSettings: (s: PayrollSettings) => void;
  clearSession: () => void;
  upsert: <K extends Key>(key: K, item: Item<K>) => void;
  upsertMany: <K extends Key>(key: K, items: Item<K>[]) => void;
  remove: <K extends Key>(key: K, id: string) => void;
  pushActivity: (a: Activity) => void;
}

const empty: Collections = {
  branches: [], departments: [], designations: [], employees: [], shifts: [], attendance: [], activities: [],
  leaveTypes: [], leaveRequests: [], holidays: [], salaryStructures: [], payrollRuns: [],
};
/** Display defaults only until bootstrap loads the company's real settings. */
const defaultSettings: PayrollSettings = { epfEmployee: 8, epfEmployer: 12, etf: 3, payDay: 28, otRate: 1.5, otHoursDivisor: 240, nopayDaysDivisor: 30 };

export const useStore = create<State>()((set) => ({
  ...empty,
  me: null,
  company: null,
  settings: defaultSettings,
  serverReady: false,

  hydrateServer: (data) => set({ ...data, serverReady: true }),
  setCompany: (company) => set({ company }),
  setSettings: (settings) => set({ settings }),
  clearSession: () => set({ ...empty, me: null, company: null, settings: defaultSettings, serverReady: false }),

  upsert: (key, item) =>
    set((s) => {
      const list = s[key] as { id: string }[];
      const id = (item as { id: string }).id;
      const exists = list.some((x) => x.id === id);
      return { [key]: exists ? list.map((x) => (x.id === id ? item : x)) : [...list, item] } as Partial<State>;
    }),
  upsertMany: (key, items) =>
    set((s) => {
      const map = new Map((s[key] as { id: string }[]).map((x) => [x.id, x]));
      for (const it of items as { id: string }[]) map.set(it.id, it);
      return { [key]: [...map.values()] } as Partial<State>;
    }),
  remove: (key, id) => set((s) => ({ [key]: (s[key] as { id: string }[]).filter((x) => x.id !== id) }) as Partial<State>),
  pushActivity: (a) => set((s) => ({ activities: [a, ...s.activities.filter((x) => x.id !== a.id)].slice(0, 50) })),
}));

onActivity((a) => useStore.getState().pushActivity(a));

// Earlier versions kept data (including plain-text passwords) in localStorage. Remove it.
if (typeof window !== "undefined") {
  try {
    window.localStorage.removeItem("hr-payroll-store");
  } catch {
    // storage unavailable (private mode): nothing to remove
  }
}

export function useCurrentUser(): User | null {
  return useStore((s) => s.me);
}

/** UI permissions mirroring the server rules (the server and database are authoritative). */
export function useCan() {
  const role = useStore((s) => s.me?.role);
  return { manageHR: role === "Administrator" || role === "HR Manager", admin: role === "Administrator" };
}

export const empName = (e?: Pick<Employee, "firstName" | "lastName">) => (e ? `${e.firstName} ${e.lastName}`.trim() : "Unknown");

export function nextEmpNo(employees: Employee[]) {
  const max = employees.reduce((m, e) => Math.max(m, parseInt(e.empNo.replace(/\D/g, "")) || 0), 0);
  return `EMP${String(max + 1).padStart(3, "0")}`;
}
