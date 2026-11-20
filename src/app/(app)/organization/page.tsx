"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Briefcase, Network, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Card, DataTable, EmptyState, Field, IconBtn, Input, Modal, PageHeader, Select, Tabs, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/useToast";
import { useCan, useStore } from "@/lib/store";
import { deleteOrg, saveBranch, saveDepartment, saveDesignation } from "@/lib/api/hr";
import { errorMessage } from "@/lib/api/client";
import { uid } from "@/lib/format";
import type { Branch, Department, Designation } from "@/lib/types";

type Tab = "branches" | "departments" | "designations";

export default function OrganizationPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const tab = (sp.get("tab") as Tab) || "branches";
  const s = useStore();
  const [toast, show] = useToast();
  const [edit, setEdit] = useState<{ kind: Tab; item: Branch | Department | Designation } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const can = useCan();

  const count = (k: "departmentId" | "designationId" | "branchId", id: string) => s.employees.filter((e) => e[k] === id).length;

  async function save() {
    if (!edit) return;
    const it = edit.item as Branch & Designation;
    if (!it.name.trim()) return setErr("Name is required.");
    if (edit.kind === "branches" && !it.code.trim()) return setErr("Code is required.");
    setBusy(true);
    try {
      if (edit.kind === "branches") await saveBranch(edit.item as Branch);
      else if (edit.kind === "departments") await saveDepartment(edit.item as Department);
      else await saveDesignation(edit.item as Designation);
      show("Saved successfully");
      setEdit(null);
      setErr("");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function del(kind: Tab, id: string, field: "departmentId" | "designationId" | "branchId") {
    if (count(field, id) > 0) return show("Cannot delete: employees are assigned to it");
    if (kind === "branches" && s.branches.length <= 1) return show("At least one branch is required");
    if (!confirm("Delete this record?")) return;
    try {
      await deleteOrg(kind, id);
      show("Deleted");
    } catch (e) {
      show(errorMessage(e));
    }
  }
  const newItem = (k: Tab) =>
    setEdit({ kind: k, item: k === "branches" ? { id: uid(), name: "", code: "", address: "", contact: "" } : { id: uid(), name: "" } });

  const label = { branches: "Branch", departments: "Department", designations: "Designation" }[tab];

  return (
    <div>
      <PageHeader title="Organization" subtitle="Branches, departments and designations used across employee records." actions={can.manageHR ? <Button icon={Plus} onClick={() => newItem(tab)}>Add {label}</Button> : undefined} />
      <Card>
        <div className="px-5 pt-3">
          <Tabs<Tab> value={tab} onChange={(t) => router.replace(`/organization?tab=${t}`)} tabs={[
            { value: "branches", label: `Branches (${s.branches.length})` },
            { value: "departments", label: `Departments (${s.departments.length})` },
            { value: "designations", label: `Designations (${s.designations.length})` },
          ]} />
        </div>
        {tab === "branches" && (
          <DataTable rows={s.branches} searchText={(b) => `${b.name} ${b.code}`} columns={[
            { key: "code", header: "Code", render: (b) => <span className="font-medium">{b.code}</span> },
            { key: "name", header: "Store / Branch", render: (b) => b.name },
            { key: "addr", header: "Address", render: (b) => <span className="text-slate-500">{b.address}</span> },
            { key: "c", header: "Contact", render: (b) => b.contact },
            { key: "e", header: "Employees", render: (b) => count("branchId", b.id) },
            { key: "a", header: "", className: "text-right", render: (b) => can.manageHR && (<><IconBtn icon={Pencil} label="Edit" onClick={() => setEdit({ kind: "branches", item: b })} /><IconBtn icon={Trash2} tone="danger" label="Delete" onClick={() => del("branches", b.id, "branchId")} /></>) },
          ]} />
        )}
        {tab === "departments" && (
          <DataTable rows={s.departments} searchText={(d) => d.name}
            empty={<EmptyState icon={Network} title="No departments yet" text="Create departments such as Sales, HR, Finance and Operations." action={can.manageHR ? <Button icon={Plus} onClick={() => newItem("departments")}>Add Department</Button> : undefined} />}
            columns={[
              { key: "name", header: "Department", render: (d) => <span className="font-medium">{d.name}</span> },
              { key: "des", header: "Designations", render: (d) => s.designations.filter((x) => x.departmentId === d.id).length },
              { key: "e", header: "Employees", render: (d) => count("departmentId", d.id) },
              { key: "a", header: "", className: "text-right", render: (d) => can.manageHR && (<><IconBtn icon={Pencil} label="Edit" onClick={() => setEdit({ kind: "departments", item: d })} /><IconBtn icon={Trash2} tone="danger" label="Delete" onClick={() => del("departments", d.id, "departmentId")} /></>) },
            ]} />
        )}
        {tab === "designations" && (
          <DataTable rows={s.designations} searchText={(d) => d.name}
            empty={<EmptyState icon={Briefcase} title="No designations yet" text="Create job titles such as Sales Executive or Accountant." action={can.manageHR ? <Button icon={Plus} onClick={() => newItem("designations")}>Add Designation</Button> : undefined} />}
            columns={[
              { key: "name", header: "Designation", render: (d) => <span className="font-medium">{d.name}</span> },
              { key: "dep", header: "Department", render: (d) => s.departments.find((x) => x.id === d.departmentId)?.name ?? "—" },
              { key: "e", header: "Employees", render: (d) => count("designationId", d.id) },
              { key: "a", header: "", className: "text-right", render: (d) => can.manageHR && (<><IconBtn icon={Pencil} label="Edit" onClick={() => setEdit({ kind: "designations", item: d })} /><IconBtn icon={Trash2} tone="danger" label="Delete" onClick={() => del("designations", d.id, "designationId")} /></>) },
            ]} />
        )}
      </Card>

      <Modal open={!!edit} onClose={() => { setEdit(null); setErr(""); }} title={`${edit && (edit.kind === "branches" ? s.branches : edit.kind === "departments" ? s.departments : s.designations).some((x) => x.id === edit.item.id) ? "Edit" : "Add"} ${edit ? { branches: "Branch", departments: "Department", designations: "Designation" }[edit.kind] : ""}`}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
        {edit && (
          <div className="space-y-4">
            {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
            <Field label="Name" required><Input autoFocus maxLength={120} value={edit.item.name} onChange={(e) => setEdit({ ...edit, item: { ...edit.item, name: e.target.value } })} /></Field>
            {edit.kind === "branches" && (() => {
              const b = edit.item as Branch;
              const up = (p: Partial<Branch>) => setEdit({ ...edit, item: { ...b, ...p } });
              return (
                <>
                  <Field label="Code" required><Input value={b.code} onChange={(e) => up({ code: e.target.value })} /></Field>
                  <Field label="Address"><Textarea value={b.address} onChange={(e) => up({ address: e.target.value })} /></Field>
                  <Field label="Contact Number"><Input value={b.contact} onChange={(e) => up({ contact: e.target.value })} /></Field>
                </>
              );
            })()}
            {edit.kind === "designations" && (
              <Field label="Department">
                <Select value={(edit.item as Designation).departmentId ?? ""} onChange={(e) => setEdit({ ...edit, item: { ...edit.item, departmentId: e.target.value || undefined } })}>
                  <option value="">Any department</option>
                  {s.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
        )}
      </Modal>
      {toast}
    </div>
  );
}
