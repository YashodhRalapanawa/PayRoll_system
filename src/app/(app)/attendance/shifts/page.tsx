"use client";
import { useState } from "react";
import { Clock, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { Button, Card, Checkbox, DataTable, EmptyState, Field, IconBtn, Input, Modal, PageHeader, Select, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/ui/useToast";
import { empName, useCan, useStore } from "@/lib/store";
import { assignShift, deleteShift, saveShift } from "@/lib/api/hr";
import { errorMessage } from "@/lib/api/client";
import { fmtHours, fmtTime, hoursBetween, uid } from "@/lib/format";
import type { Shift } from "@/lib/types";

const blank = (): Shift => ({ id: uid(), name: "", start: "08:30", end: "17:30", breakMins: 60, status: "Active" });

export default function ShiftsPage() {
  const s = useStore();
  const [toast, show] = useToast();
  const [edit, setEdit] = useState<Shift | null>(null);
  const [assign, setAssign] = useState<Shift | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const can = useCan();
  const count = (id: string) => s.employees.filter((e) => e.shiftId === id).length;

  async function save() {
    if (!edit!.name.trim()) return setErr("Shift name is required.");
    setBusy(true);
    try {
      await saveShift(edit!);
      setEdit(null);
      show("Shift saved");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveAssign() {
    setBusy(true);
    try {
      await assignShift(assign!.id, [...sel]);
      show(`${sel.size} employees on ${assign!.name}`);
      setAssign(null);
    } catch (e) {
      show(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(x: Shift) {
    if (count(x.id)) return show("Unassign employees before deleting");
    if (!confirm("Delete this shift?")) return;
    try {
      await deleteShift(x.id);
    } catch (e) {
      show(errorMessage(e));
    }
  }

  return (
    <div>
      <PageHeader title="Shifts" subtitle="Working hours, breaks and employee shift assignments." actions={can.manageHR ? <Button icon={Plus} onClick={() => { setErr(""); setEdit(blank()); }}>Add Shift</Button> : undefined} />
      <Card>
        <DataTable rows={s.shifts} searchText={(x) => x.name}
          empty={<EmptyState icon={Clock} title="No shifts yet" text="Create shifts such as General, Morning, Evening or Night." action={can.manageHR ? <Button icon={Plus} onClick={() => setEdit(blank())}>Add Shift</Button> : undefined} />}
          columns={[
            { key: "n", header: "Shift Name", render: (x) => <span className="font-medium text-slate-800">{x.name}</span> },
            { key: "s", header: "Start Time", render: (x) => fmtTime(x.start) },
            { key: "e", header: "End Time", render: (x) => fmtTime(x.end) },
            { key: "b", header: "Break", render: (x) => fmtHours(x.breakMins / 60) },
            { key: "w", header: "Work Hours", render: (x) => fmtHours(Math.max(0, hoursBetween(x.start, x.end) - x.breakMins / 60)) },
            { key: "c", header: "Employees", render: (x) => count(x.id) },
            { key: "st", header: "Status", render: (x) => <StatusBadge status={x.status} /> },
            { key: "a", header: "", className: "text-right", render: (x) => can.manageHR && (
              <>
                <IconBtn icon={UserPlus} label="Assign employees" onClick={() => { setSel(new Set(s.employees.filter((e) => e.shiftId === x.id).map((e) => e.id))); setAssign(x); }} />
                <IconBtn icon={Pencil} label="Edit" onClick={() => { setErr(""); setEdit(x); }} />
                <IconBtn icon={Trash2} tone="danger" label="Delete" onClick={() => remove(x)} />
              </>
            ) },
          ]} />
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit && s.shifts.some((x) => x.id === edit.id) ? "Edit Shift" : "Add Shift"}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{err}</p>}
            <Field label="Shift Name" required className="sm:col-span-2"><Input autoFocus maxLength={60} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="General Shift" /></Field>
            <Field label="Start Time"><Input type="time" value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value })} /></Field>
            <Field label="End Time" hint="An end time before the start crosses midnight."><Input type="time" value={edit.end} onChange={(e) => setEdit({ ...edit, end: e.target.value })} /></Field>
            <Field label="Break (minutes)"><Input type="number" min={0} step={5} value={edit.breakMins} onChange={(e) => setEdit({ ...edit, breakMins: +e.target.value })} /></Field>
            <Field label="Status"><Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as Shift["status"] })}><option>Active</option><option>Inactive</option></Select></Field>
          </div>
        )}
      </Modal>

      <Modal open={!!assign} onClose={() => setAssign(null)} title={`Assign employees — ${assign?.name}`}
        footer={<><Button variant="secondary" onClick={() => setAssign(null)}>Cancel</Button><Button onClick={saveAssign} disabled={busy}>{busy ? "Saving…" : "Save Assignment"}</Button></>}>
        {s.employees.length === 0 ? <p className="text-sm text-slate-500">No employees yet.</p> : (
          <ul className="max-h-96 space-y-1 overflow-y-auto">
            {s.employees.map((e) => {
              const other = e.shiftId && e.shiftId !== assign?.id ? s.shifts.find((x) => x.id === e.shiftId)?.name : null;
              return (
                <li key={e.id} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-slate-50">
                  <Checkbox checked={sel.has(e.id)} onChange={(v) => setSel((p) => { const n = new Set(p); if (v) n.add(e.id); else n.delete(e.id); return n; })} label={<span className="text-slate-700">{e.empNo} · {empName(e)}</span>} />
                  {other && <span className="text-xs text-slate-400">on {other}</span>}
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
