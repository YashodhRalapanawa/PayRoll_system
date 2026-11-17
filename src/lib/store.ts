"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect, useState } from "react";
import { uid } from "./format";
import type {
  Activity, Attendance, Branch, Company, Department, Designation, Employee, Holiday, LeaveRequest,
  LeaveType, PayrollRun, PayrollSettings, SalaryStructure, Shift, User,
} from "./types";

/**
 * Local, browser-only data store (MVP UI phase).
 * Collections mirror the planned Supabase tables so the swap to real APIs stays mechanical.
 */
export interface Collections {
  users: User[];
  branches: Branch[];
  departments: Department[];
  designations: Designation[];
  employees: Employee[];
  shifts: Shift[];
  attendance: Attendance[];
  leaveTypes: LeaveType[];
  leaveRequests: LeaveRequest[];
  holidays: Holiday[];
  salaryStructures: SalaryStructure[];
  payrollRuns: PayrollRun[];
  activities: Activity[];
}
type Key = keyof Collections;
type Item<K extends Key> = Collections[K][number];

interface State extends Collections {
  sessionUserId: string | null;
  company: Company | null;
  setupComplete: boolean;
  settings: PayrollSettings;
  register: (u: Omit<User, "id" | "role">) => { ok: boolean; error?: string };
  login: (email: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
  saveCompany: (c: Company) => void;
  completeSetup: () => void;
  saveSettings: (s: PayrollSettings) => void;
  upsert: <K extends Key>(key: K, item: Item<K>) => void;
  upsertMany: <K extends Key>(key: K, items: Item<K>[]) => void;
  remove: <K extends Key>(key: K, id: string) => void;
  log: (type: Activity["type"], title: string, detail: string) => void;
  resetAll: () => void;
}

const empty: Collections = {
  users: [], branches: [], departments: [], designations: [], employees: [], shifts: [], attendance: [],
  leaveTypes: [
    { id: "lt-annual", name: "Annual Leave", daysPerYear: 14, paid: true },
    { id: "lt-casual", name: "Casual Leave", daysPerYear: 7, paid: true },
    { id: "lt-medical", name: "Medical Leave", daysPerYear: 7, paid: true },
    { id: "lt-nopay", name: "No-pay Leave", daysPerYear: 0, paid: false },
  ],
  leaveRequests: [], holidays: [], salaryStructures: [], payrollRuns: [], activities: [],
};
const defaultSettings: PayrollSettings = { epfEmployee: 8, epfEmployer: 12, etf: 3, payDay: 28, otRate: 1.5 };

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...empty,
      sessionUserId: null,
      company: null,
      setupComplete: false,
      settings: defaultSettings,
      register: ({ name, email, password }) => {
        const e = email.trim().toLowerCase();
        if (get().users.some((u) => u.email === e)) return { ok: false, error: "An account with this email already exists." };
        const user: User = { id: uid(), name: name.trim(), email: e, password, role: "Administrator" };
        set((s) => ({ users: [...s.users, user], sessionUserId: user.id }));
        return { ok: true };
      },
      login: (email, password) => {
        const u = get().users.find((x) => x.email === email.trim().toLowerCase());
        if (!u || u.password !== password) return { ok: false, error: "Invalid email or password." };
        set({ sessionUserId: u.id });
        return { ok: true };
      },
      logout: () => set({ sessionUserId: null }),
      saveCompany: (company) => set({ company }),
      completeSetup: () => set({ setupComplete: true }),
      saveSettings: (settings) => set({ settings }),
      upsert: (key, item) =>
        set((s) => {
          const list = s[key] as { id: string }[];
          const exists = list.some((x) => x.id === (item as { id: string }).id);
          return { [key]: exists ? list.map((x) => (x.id === (item as { id: string }).id ? item : x)) : [...list, item] } as Partial<State>;
        }),
      upsertMany: (key, items) =>
        set((s) => {
          const map = new Map((s[key] as { id: string }[]).map((x) => [x.id, x]));
          for (const it of items as { id: string }[]) map.set(it.id, it);
          return { [key]: [...map.values()] } as Partial<State>;
        }),
      remove: (key, id) => set((s) => ({ [key]: (s[key] as { id: string }[]).filter((x) => x.id !== id) }) as Partial<State>),
      log: (type, title, detail) =>
        set((s) => ({ activities: [{ id: uid(), type, title, detail, at: new Date().toISOString() }, ...s.activities].slice(0, 50) })),
      resetAll: () => set({ ...empty, sessionUserId: null, company: null, setupComplete: false, settings: defaultSettings }),
    }),
    { name: "hr-payroll-store", version: 1 },
  ),
);

/** True once the persisted store has been rehydrated on the client. */
export function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => {
    if (useStore.persist.hasHydrated()) setH(true);
    return useStore.persist.onFinishHydration(() => setH(true));
  }, []);
  return h;
}

export function useCurrentUser() {
  return useStore((s) => s.users.find((u) => u.id === s.sessionUserId) ?? null);
}

export const empName = (e?: Employee) => (e ? `${e.firstName} ${e.lastName}`.trim() : "Unknown");

export function nextEmpNo(employees: Employee[]) {
  const max = employees.reduce((m, e) => Math.max(m, parseInt(e.empNo.replace(/\D/g, "")) || 0), 0);
  return `EMP${String(max + 1).padStart(3, "0")}`;
}
