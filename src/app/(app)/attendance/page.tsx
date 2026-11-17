"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AlarmClock, CalendarCheck, CalendarX, Clock, Download, Pencil, Umbrella, UserCheck, Users } from "lucide-react";
import { Avatar, Button, Card, DataTable, EmptyState, Field, IconBtn, Input, Modal, PageHeader, Select, StatCard, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/ui/useToast";
import { empName, useStore } from "@/lib/store";
import { downloadCSV, fmtDate, fmtHours, fmtTime, hoursBetween, today, uid } from "@/lib/format";
import type { Attendance, AttendanceStatus, Employee } from "@/lib/types";

interface Row { id: string; emp: Employee; rec?: Attendance; onLeave: boolean }

export default function AttendancePage() {
  const s = useStore();
  const [toast, show] = useToast();
  const [date, setDate] = useState(today());
  const [branch, setBranch] = useState("");
  const [edit, setEdit] = useState<Attendance | null>(null);

  const rows: Row[] = useMemo(() => {
    const leaveIds = new Set(s.leaveRequests.filter((l) => l.status === "Approved" && l.from <= date && l.to >= date).map((l) => l.employeeId));
    return s.employees
      .filter((e) => e.status === "Active" && e.joinDate <= date && (!branch || e.branchId === branch))
      .sort((a, b) => a.empNo.localeCompare(b.empNo))
      .map((emp) => ({ id: emp.id, emp, rec: s.attendance.find((a) => a.employeeId === emp.id && a.date === date), onLeave: leaveIds.has(emp.id) }));
  }, [s.employees, s.attendance, s.leaveRequests, date, branch]);

  const status = (r: Row): AttendanceStatus | "Not Marked" => r.rec?.status ?? (r.onLeave ? "On Leave" : "Not Marked");
  const c = (st: string) => rows.filter((r) => status(r) === st).length;

  function lateStatus(emp: Employee, inTime: string): AttendanceStatus {
    const sh = s.shifts.find((x) => x.id === emp.shiftId);
    if (!sh) return "Present";
    const [h1, m1] = sh.start.split(":").map(Number), [h2, m2] = inTime.split(":").map(Number);
    return h2 * 60 + m2 > h1 * 60 + m1 + 10 ? "Late" : "Present";
  }

  function markAllPresent() {
    const items = rows.filter((r) => !r.rec && !r.onLeave).map((r) => {
      const sh = s.shifts.find((x) => x.id === r.emp.shiftId);
      return { id: uid(), employeeId: r.emp.id, date, inTime: sh?.start ?? "08:30", outTime: sh?.end ?? "17:30", status: "Present" as const, overtimeHours: 0 };
    });
    if (!items.length) return show("Everyone is already marked");
    s.upsertMany("attendance", items);
    s.log("attendance", "Attendance marked", `${items.length} employees marked present for ${fmtDate(date)}.`);
    show(`${items.length} employees marked present`);
  }

  function openEdit(r: Row) {
    const sh = s.shifts.find((x) => x.id === r.emp.shiftId);
    setEdit(r.rec ?? { id: uid(), employeeId: r.emp.id, date, inTime: sh?.start ?? "08:30", outTime: sh?.end ?? "17:30", status: r.onLeave ? "On Leave" : "Present", overtimeHours: 0 });
  }

  const editEmp = edit && s.employees.find((e) => e.id === edit.employeeId);

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" subtitle="Daily check-in / check-out and overtime." actions={
        <>
          <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} className="w-auto" />
          <Select value={branch} onChange={(e) => setBranch(e.target.value)} className="w-auto">
            <option value="">All branches</option>
            {s.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Link href="/attendance/shifts"><Button variant="secondary" icon={Clock}>Shifts</Button></Link>
        </>
      } />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Present" value={c("Present") + c("Half Day")} icon={CalendarCheck} tint="green" />
        <StatCard label="Absent" value={c("Absent")} icon={CalendarX} tint="pink" />
        <StatCard label="On Leave" value={c("On Leave")} icon={Umbrella} tint="amber" />
        <StatCard label="Late" value={c("Late")} icon={AlarmClock} tint="violet" sub={`${c("Not Marked")} not marked`} />
      </div>

      <Card>
        <DataTable
          rows={rows}
          selectable
          searchText={(r) => `${r.emp.empNo} ${empName(r.emp)}`}
          toolbar={
            <>
              <Button variant="secondary" icon={Download} disabled={!rows.length} onClick={() => downloadCSV(`attendance-${date}.csv`, [
                ["Emp ID", "Employee", "In", "Out", "Hours", "OT", "Status"],
                ...rows.map((r) => [r.emp.empNo, empName(r.emp), r.rec?.inTime ?? "", r.rec?.outTime ?? "", fmtHours(hoursBetween(r.rec?.inTime, r.rec?.outTime)), r.rec?.overtimeHours ?? 0, status(r)]),
              ])}>Export</Button>
              <Button icon={UserCheck} onClick={markAllPresent} disabled={!rows.length}>Mark unmarked as present</Button>
            </>
          }
          empty={<EmptyState icon={Users} title="No active employees" text="Add employees to start tracking attendance." />}
          columns={[
            { key: "id", header: "Emp ID", render: (r) => <span className="font-medium">{r.emp.empNo}</span> },
            { key: "n", header: "Employee", render: (r) => <div className="flex items-center gap-3"><Avatar name={empName(r.emp)} size={32} />{empName(r.emp)}</div> },
            { key: "in", header: "In Time", render: (r) => fmtTime(r.rec?.inTime) },
            { key: "out", header: "Out Time", render: (r) => fmtTime(r.rec?.outTime) },
            { key: "h", header: "Hours", render: (r) => fmtHours(hoursBetween(r.rec?.inTime, r.rec?.outTime)) },
            { key: "ot", header: "OT", render: (r) => r.rec?.overtimeHours || "—" },
            { key: "st", header: "Status", render: (r) => status(r) === "Not Marked" ? <span className="text-xs text-slate-400">Not marked</span> : <StatusBadge status={status(r)} /> },
            { key: "a", header: "", className: "text-right", render: (r) => <IconBtn icon={Pencil} label="Mark / edit" onClick={() => openEdit(r)} /> },
          ]}
        />
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Attendance — ${empName(editEmp ?? undefined)}`} footer={
        <>
          {edit && s.attendance.some((a) => a.id === edit.id) && <Button variant="danger" className="mr-auto" onClick={() => { s.remove("attendance", edit.id); setEdit(null); }}>Clear</Button>}
          <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
          <Button onClick={() => { s.upsert("attendance", edit!); setEdit(null); show("Attendance saved"); }}>Save</Button>
        </>
      }>
        {edit && editEmp && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" className="sm:col-span-2"><Input value={fmtDate(edit.date)} disabled /></Field>
            <Field label="Status">
              <Select value={edit.status} onChange={(e) => {
                const st = e.target.value as AttendanceStatus;
                setEdit({ ...edit, status: st, ...(st === "Absent" || st === "On Leave" ? { inTime: undefined, outTime: undefined, overtimeHours: 0 } : {}) });
              }}>
                {(["Present", "Late", "Half Day", "Absent", "On Leave"] as const).map((x) => <option key={x}>{x}</option>)}
              </Select>
            </Field>
            <Field label="Overtime (hours)"><Input type="number" min={0} step={0.5} value={edit.overtimeHours} onChange={(e) => setEdit({ ...edit, overtimeHours: +e.target.value })} disabled={edit.status === "Absent" || edit.status === "On Leave"} /></Field>
            <Field label="In Time"><Input type="time" value={edit.inTime ?? ""} disabled={edit.status === "Absent" || edit.status === "On Leave"} onChange={(e) => setEdit({ ...edit, inTime: e.target.value, status: edit.status === "Half Day" ? edit.status : lateStatus(editEmp, e.target.value) })} /></Field>
            <Field label="Out Time"><Input type="time" value={edit.outTime ?? ""} disabled={edit.status === "Absent" || edit.status === "On Leave"} onChange={(e) => setEdit({ ...edit, outTime: e.target.value })} /></Field>
            <p className="text-xs text-slate-500 sm:col-span-2">Worked: {fmtHours(hoursBetween(edit.inTime, edit.outTime))} hrs. Arrivals more than 10 minutes after the shift start are marked Late.</p>
          </div>
        )}
      </Modal>
      {toast}
    </div>
  );
}
