"use client";
import { useState } from "react";
import { Layers, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { Button, Card, Checkbox, DataTable, EmptyState, Field, IconBtn, Input, Modal, PageHeader, Select } from "@/components/ui";
import { useToast } from "@/components/ui/useToast";
import { empName, useCan, useStore } from "@/lib/store";
import { assignSalaryStructure, deleteSalaryStructure, saveSalaryStructure } from "@/lib/api/payroll";
import { errorMessage } from "@/lib/api/client";
import { money, uid } from "@/lib/format";
import type { SalaryItem, SalaryStructure } from "@/lib/types";

const blank = (): SalaryStructure => ({ id: uid(), name: "", basic: 0, allowances: [], deductions: [] });

export default function SalaryPage() {
  const s = useStore();
  const [toast, show] = useToast();
  const [edit, setEdit] = useState<SalaryStructure | null>(null);
  const [assign, setAssign] = useState<SalaryStructure | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const can = useCan();
  const code = s.company?.currencyCode ?? "LKR";
  const count = (id: string) => s.employees.filter((e) => e.salaryStructureId === id).length;

  async function save() {
    const e = edit!;
    if (!e.name.trim()) return setErr("Structure name is required.");
    if (!(e.basic > 0)) return setErr("Basic salary must be greater than zero.");
    if ([...e.allowances, ...e.deductions].some((i) => !i.name.trim())) return setErr("Every allowance and deduction needs a name.");
    if ([...e.allowances, ...e.deductions].some((i) => i.type === "percent" && i.amount > 100)) return setErr("A percentage cannot exceed 100.");
    setBusy(true);
    try {
      await saveSalaryStructure(e);
      show("Salary structure saved");
      setEdit(null);
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (count(id)) return show("Unassign employees before deleting");
    if (!confirm("Delete this structure?")) return;
    try {
      await deleteSalaryStructure(id);
    } catch (x) {
      show(errorMessage(x));
    }
  }
  async function saveAssign() {
    setBusy(true);
    try {
      await assignSalaryStructure(assign!.id, [...sel]);
      show("Assignments saved");
      setAssign(null);
    } catch (x) {
      show(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  function itemRows(kind: "allowances" | "deductions") {
    const e = edit!;
    const items = e[kind];
    const set = (list: SalaryItem[]) => setEdit({ ...e, [kind]: list });
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700">{kind === "allowances" ? "Allowances" : "Deductions"}</h4>
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => set([...items, { id: uid(), name: "", type: "fixed", amount: 0 }])}>Add</Button>
        </div>
        {items.length === 0 && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">None</p>}
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={it.id} className="grid grid-cols-[1fr_100px_110px_32px] items-center gap-2">
              <Input maxLength={60} placeholder={kind === "allowances" ? "e.g. Transport" : "e.g. Salary Advance"} value={it.name} onChange={(x) => set(items.map((y, j) => (j === i ? { ...y, name: x.target.value } : y)))} />
              <Select value={it.type} onChange={(x) => set(items.map((y, j) => (j === i ? { ...y, type: x.target.value as SalaryItem["type"] } : y)))}>
                <option value="fixed">Fixed</option><option value="percent">% Basic</option>
              </Select>
              <Input type="number" min={0} max={it.type === "percent" ? 100 : undefined} step="0.01" value={it.amount} onChange={(x) => set(items.map((y, j) => (j === i ? { ...y, amount: +x.target.value } : y)))} />
              <IconBtn icon={Trash2} tone="danger" label="Remove" onClick={() => set(items.filter((_, j) => j !== i))} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Salary Structures" subtitle="Basic pay, allowances and deductions applied during payroll." actions={can.admin ? <Button icon={Plus} onClick={() => { setErr(""); setEdit(blank()); }}>Add Structure</Button> : undefined} />
      <Card>
        <DataTable rows={s.salaryStructures} searchText={(x) => x.name}
          empty={<EmptyState icon={Layers} title="No salary structures" text="Create structures like General Staff, Executive or Management." action={can.admin ? <Button icon={Plus} onClick={() => setEdit(blank())}>Add Structure</Button> : undefined} />}
          columns={[
            { key: "n", header: "Structure Name", render: (x) => <span className="font-medium text-slate-800">{x.name}</span> },
            { key: "b", header: "Basic Salary", className: "text-right", render: (x) => money(x.basic, code, false) },
            { key: "a", header: "Allowances", className: "text-center", render: (x) => x.allowances.length },
            { key: "d", header: "Deductions", className: "text-center", render: (x) => x.deductions.length },
            { key: "e", header: "Employees", className: "text-center", render: (x) => count(x.id) },
            { key: "x", header: "", className: "text-right", render: (x) => can.admin && (
              <>
                <IconBtn icon={UserPlus} label="Assign employees" onClick={() => { setSel(new Set(s.employees.filter((e) => e.salaryStructureId === x.id).map((e) => e.id))); setAssign(x); }} />
                <IconBtn icon={Pencil} label="Edit" onClick={() => { setErr(""); setEdit(structuredClone(x)); }} />
                <IconBtn icon={Trash2} tone="danger" label="Delete" onClick={() => remove(x.id)} />
              </>
            ) },
          ]} />
      </Card>

      <Modal wide open={!!edit} onClose={() => setEdit(null)} title={edit && s.salaryStructures.some((x) => x.id === edit.id) ? "Edit Salary Structure" : "Add Salary Structure"}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Structure"}</Button></>}>
        {edit && (
          <div className="space-y-5">
            {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Structure Name" required><Input autoFocus maxLength={80} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="General Staff" /></Field>
              <Field label={`Basic Salary (${code})`} required><Input type="number" min={0} value={edit.basic || ""} onChange={(e) => setEdit({ ...edit, basic: +e.target.value })} /></Field>
            </div>
            {itemRows("allowances")}
            {itemRows("deductions")}
            <p className="text-xs text-slate-500">EPF ({s.settings.epfEmployee}% employee) is deducted automatically during payroll; configure rates in Settings.</p>
          </div>
        )}
      </Modal>

      <Modal open={!!assign} onClose={() => setAssign(null)} title={`Assign — ${assign?.name}`} footer={
        <><Button variant="secondary" onClick={() => setAssign(null)}>Cancel</Button>
          <Button onClick={saveAssign} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>
      }>
        {s.employees.length === 0 ? <p className="text-sm text-slate-500">No employees yet.</p> : (
          <ul className="max-h-96 space-y-1 overflow-y-auto">
            {s.employees.map((e) => {
              const other = e.salaryStructureId && e.salaryStructureId !== assign?.id ? s.salaryStructures.find((x) => x.id === e.salaryStructureId)?.name : null;
              return (
                <li key={e.id} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-slate-50">
                  <Checkbox checked={sel.has(e.id)} onChange={(v) => setSel((p) => { const n = new Set(p); if (v) n.add(e.id); else n.delete(e.id); return n; })} label={<span className="text-slate-700">{e.empNo} · {empName(e)}</span>} />
                  {other && <span className="text-xs text-slate-400">{other}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
      {toast}
    </div>
  );
}
