"use client";
/**
 * Data layer for Developer A's modules. Each function calls the API, then
 * updates the store with what the server returned (never optimistically), so
 * screens keep reading from useStore() as before.
 */
import { useStore, type BootstrapData } from "@/lib/store";
import type {
  Attendance, Branch, Company, Department, Designation, DocumentRef, Employee, Invite, RoleLabel, Shift, User,
} from "@/lib/types";
import { api, ApiClientError } from "./client";

const st = () => useStore.getState();
const exists = (list: { id: string }[], id: string) => list.some((x) => x.id === id);

// ---------- session ----------
export type BootstrapResult = "ready" | "needs-setup" | "unauthenticated";

export async function loadBootstrap(): Promise<BootstrapResult> {
  try {
    const data = await api.get<({ needsSetup: true } | ({ needsSetup: false } & BootstrapData))>("/api/bootstrap");
    if (data.needsSetup) return "needs-setup";
    st().hydrateServer(data);
    return "ready";
  } catch (e) {
    if (e instanceof ApiClientError && e.status === 401) return "unauthenticated";
    throw e;
  }
}

export function getMe() {
  return api.get<{ me: User & { companyId: string | null }; company: Company | null }>("/api/me");
}

// ---------- onboarding & company ----------
/** The logo (a local preview data URL) is never sent here; it is uploaded separately. */
function withoutLogo(company: Company): Omit<Company, "logo"> {
  const rest: Partial<Company> = { ...company };
  delete rest.logo;
  return rest as Omit<Company, "logo">;
}

export async function completeOnboarding(company: Company, branch: Omit<Branch, "id">) {
  return api.post<{ companyId: string }>("/api/onboarding", { company: withoutLogo(company), branch });
}

export async function saveCompany(company: Company) {
  const { company: saved } = await api.patch<{ company: Company }>("/api/company", withoutLogo(company));
  st().setCompany(saved);
  return saved;
}

export async function uploadLogo(file: File) {
  const form = new FormData();
  form.append("file", file);
  const { logo } = await api.post<{ logo: string }>("/api/company/logo", form);
  const c = st().company;
  if (c) st().setCompany({ ...c, logo });
  return logo;
}

export async function removeLogo() {
  await api.del("/api/company/logo");
  const c = st().company;
  if (c) st().setCompany({ ...c, logo: undefined });
}

// ---------- organization ----------
async function saveOrg<T extends { id: string }>(key: "branches" | "departments" | "designations", path: string, prop: string, item: T): Promise<T> {
  const isNew = !exists(st()[key], item.id);
  const res = isNew ? await api.post<Record<string, T>>(path, item) : await api.patch<Record<string, T>>(`${path}/${item.id}`, item);
  const saved = res[prop];
  st().upsert(key, saved as never);
  return saved;
}

export const saveBranch = (b: Branch) => saveOrg("branches", "/api/branches", "branch", b);
export const saveDepartment = (d: Department) => saveOrg("departments", "/api/departments", "department", d);
export const saveDesignation = (d: Designation) => saveOrg("designations", "/api/designations", "designation", d);

export async function deleteOrg(kind: "branches" | "departments" | "designations", id: string) {
  await api.del(`/api/${kind}/${id}`);
  st().remove(kind, id);
  if (kind === "departments") {
    // Mirror the database rule: designations of a deleted department become "any department".
    const des = st().designations.filter((d) => d.departmentId === id).map((d) => ({ ...d, departmentId: undefined }));
    if (des.length) st().upsertMany("designations", des);
  }
}

// ---------- employees ----------
export async function saveEmployee(e: Employee): Promise<Employee> {
  const isNew = !exists(st().employees, e.id);
  const res = isNew
    ? await api.post<{ employee: Employee }>("/api/employees", e)
    : await api.patch<{ employee: Employee }>(`/api/employees/${e.id}`, e);
  // Salary structure stays local until B4 (see salaryLinks in the store).
  const saved = { ...res.employee, salaryStructureId: e.salaryStructureId };
  st().upsert("employees", saved);
  return saved;
}

export async function setEmployeeStatus(e: Employee, status: Employee["status"]) {
  const { employee } = await api.patch<{ employee: Employee }>(`/api/employees/${e.id}`, { status });
  st().upsert("employees", { ...employee, salaryStructureId: e.salaryStructureId });
}

export async function deleteEmployee(id: string) {
  await api.del(`/api/employees/${id}`);
  st().remove("employees", id);
  useStore.setState((s) => ({ attendance: s.attendance.filter((a) => a.employeeId !== id) }));
}

export async function listDocuments(employeeId: string) {
  return (await api.get<{ documents: DocumentRef[] }>(`/api/employees/${employeeId}/documents`)).documents;
}

export async function addDocument(employeeId: string, doc: { name: string; reference: string; file?: File | null }) {
  const form = new FormData();
  form.append("name", doc.name);
  form.append("reference", doc.reference);
  if (doc.file) form.append("file", doc.file);
  return (await api.post<{ document: DocumentRef }>(`/api/employees/${employeeId}/documents`, form)).document;
}

export async function documentUrl(employeeId: string, docId: string) {
  return (await api.get<{ url: string }>(`/api/employees/${employeeId}/documents/${docId}`)).url;
}

export async function deleteDocument(employeeId: string, docId: string) {
  await api.del(`/api/employees/${employeeId}/documents/${docId}`);
}

// ---------- shifts ----------
export async function saveShift(s: Shift) {
  const isNew = !exists(st().shifts, s.id);
  const { shift } = isNew ? await api.post<{ shift: Shift }>("/api/shifts", s) : await api.patch<{ shift: Shift }>(`/api/shifts/${s.id}`, s);
  st().upsert("shifts", shift);
  return shift;
}

export async function deleteShift(id: string) {
  await api.del(`/api/shifts/${id}`);
  st().remove("shifts", id);
}

export async function assignShift(shiftId: string, employeeIds: string[]) {
  const { employees } = await api.post<{ employees: Employee[] }>(`/api/shifts/${shiftId}/assign`, { employeeIds });
  const links = st().salaryLinks;
  useStore.setState({ employees: employees.map((e) => ({ ...e, salaryStructureId: links[e.id] ?? e.salaryStructureId })) });
}

// ---------- attendance ----------
export async function loadAttendanceForDate(date: string) {
  const { attendance } = await api.get<{ attendance: Attendance[] }>(`/api/attendance?date=${encodeURIComponent(date)}`);
  useStore.setState((s) => ({ attendance: [...s.attendance.filter((a) => a.date !== date), ...attendance] }));
}

export async function saveAttendance(a: Attendance) {
  const { record } = await api.put<{ record: Attendance }>("/api/attendance", a);
  useStore.setState((s) => ({
    attendance: [...s.attendance.filter((x) => !(x.employeeId === record.employeeId && x.date === record.date)), record],
  }));
  return record;
}

export async function clearAttendance(id: string) {
  await api.del(`/api/attendance/${id}`);
  st().remove("attendance", id);
}

export async function markPresent(date: string, employeeIds: string[]) {
  const { records } = await api.post<{ records: Attendance[] }>("/api/attendance/bulk", { date, employeeIds });
  st().upsertMany("attendance", records);
  return records.length;
}

// ---------- roles ----------
export function listRoles() {
  return api.get<{ users: User[]; invites: Invite[] }>("/api/settings/roles");
}
export async function setRole(userId: string, role: RoleLabel) {
  return (await api.patch<{ user: User }>(`/api/settings/roles/${userId}`, { role })).user;
}
export async function inviteUser(email: string, role: RoleLabel) {
  return (await api.post<{ invite: Invite }>("/api/settings/roles/invites", { email, role })).invite;
}
export function cancelInvite(id: string) {
  return api.del(`/api/settings/roles/invites/${id}`);
}
