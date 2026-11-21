"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { empName, nextEmpNo, useStore } from "@/lib/store";
import { saveEmployee } from "@/lib/api/hr";
import { ApiClientError, errorMessage } from "@/lib/api/client";
import { today, uid } from "@/lib/format";
import type { Employee } from "@/lib/types";

export function EmployeeForm({ existing }: { existing?: Employee }) {
  const router = useRouter();
  const s = useStore();
  const [e, setE] = useState<Employee>(
    existing ?? {
      id: uid(), empNo: nextEmpNo(s.employees), firstName: "", lastName: "", nic: "", dob: "", gender: "Male",
      phone: "", email: "", address: "", departmentId: "", designationId: "", branchId: s.branches[0]?.id ?? "",
      shiftId: s.shifts[0]?.id, joinDate: today(), employmentType: "Permanent", status: "Active", documents: [],
    },
  );
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const up = (p: Partial<Employee>) => setE({ ...e, ...p });
  const designations = s.designations.filter((d) => !d.departmentId || !e.departmentId || d.departmentId === e.departmentId);

  async function save() {
    const er: Record<string, string> = {};
    if (!e.empNo.trim()) er.empNo = "Required";
    else if (s.employees.some((x) => x.empNo === e.empNo && x.id !== e.id)) er.empNo = "Employee ID already in use";
    if (!e.firstName.trim()) er.firstName = "Required";
    if (!e.lastName.trim()) er.lastName = "Required";
    if (!e.nic.trim()) er.nic = "Required";
    if (e.email && !/^\S+@\S+\.\S+$/.test(e.email)) er.email = "Invalid email";
    if (!e.departmentId) er.departmentId = "Required";
    if (!e.designationId) er.designationId = "Required";
    if (!e.branchId) er.branchId = "Required";
    if (!e.joinDate) er.joinDate = "Required";
    setErr(er);
    if (Object.keys(er).length) return window.scrollTo({ top: 0, behavior: "smooth" });
    setBusy(true);
    try {
      const saved = await saveEmployee(e);
      router.push(`/employees/${saved.id}`);
    } catch (x) {
      // The server validates everything again; show its per-field messages.
      setErr({ ...(x instanceof ApiClientError ? x.fields ?? {} : {}), form: errorMessage(x) });
      window.scrollTo({ top: 0, behavior: "smooth" });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={existing ? `/employees/${existing.id}` : "/employees"} className="rounded-lg p-2 text-slate-500 hover:bg-white"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{existing ? `Edit ${empName(existing)}` : "Add Employee"}</h1>
          <p className="text-sm text-slate-500">Personal, employment and payroll details.</p>
        </div>
      </div>

      {err.form && <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{err.form}</div>}

      {(s.departments.length === 0 || s.designations.length === 0) && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Departments and designations are needed first. <Link href="/organization?tab=departments" className="font-semibold underline">Set up organization</Link>
        </div>
      )}

      <Card title="Personal Information">
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Employee ID" required error={err.empNo}><Input value={e.empNo} onChange={(x) => up({ empNo: x.target.value })} /></Field>
          <Field label="First Name" required error={err.firstName}><Input value={e.firstName} onChange={(x) => up({ firstName: x.target.value })} /></Field>
          <Field label="Last Name" required error={err.lastName}><Input value={e.lastName} onChange={(x) => up({ lastName: x.target.value })} /></Field>
          <Field label="NIC Number" required error={err.nic}><Input value={e.nic} onChange={(x) => up({ nic: x.target.value })} /></Field>
          <Field label="Date of Birth" error={err.dob}><Input type="date" value={e.dob} onChange={(x) => up({ dob: x.target.value })} /></Field>
          <Field label="Gender"><Select value={e.gender} onChange={(x) => up({ gender: x.target.value })}><option>Male</option><option>Female</option><option>Other</option></Select></Field>
          <Field label="Phone Number" error={err.phone}><Input value={e.phone} onChange={(x) => up({ phone: x.target.value })} /></Field>
          <Field label="Email" error={err.email}><Input type="email" value={e.email} onChange={(x) => up({ email: x.target.value })} /></Field>
          <Field label="Address" error={err.address} className="sm:col-span-2 lg:col-span-1"><Textarea rows={1} value={e.address} onChange={(x) => up({ address: x.target.value })} /></Field>
        </div>
      </Card>

      <Card title="Employment Details">
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Department" required error={err.departmentId}>
            <Select value={e.departmentId} onChange={(x) => up({ departmentId: x.target.value, designationId: "" })}>
              <option value="">Select department</option>
              {s.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Designation" required error={err.designationId}>
            <Select value={e.designationId} onChange={(x) => up({ designationId: x.target.value })}>
              <option value="">Select designation</option>
              {designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Branch" required error={err.branchId}>
            <Select value={e.branchId} onChange={(x) => up({ branchId: x.target.value })}>
              {s.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Shift" error={err.shiftId}>
            <Select value={e.shiftId ?? ""} onChange={(x) => up({ shiftId: x.target.value || undefined })}>
              <option value="">No shift</option>
              {s.shifts.map((sh) => <option key={sh.id} value={sh.id}>{sh.name}</option>)}
            </Select>
          </Field>
          <Field label="Join Date" required error={err.joinDate}><Input type="date" value={e.joinDate} onChange={(x) => up({ joinDate: x.target.value })} /></Field>
          <Field label="Employment Type">
            <Select value={e.employmentType} onChange={(x) => up({ employmentType: x.target.value as Employee["employmentType"] })}>
              <option>Permanent</option><option>Contract</option><option>Probation</option><option>Intern</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={e.status} onChange={(x) => up({ status: x.target.value as Employee["status"] })}><option>Active</option><option>Inactive</option></Select>
          </Field>
        </div>
      </Card>

      <Card title="Salary & Bank">
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Salary Structure" hint="Defines allowances and deductions.">
            <Select value={e.salaryStructureId ?? ""} onChange={(x) => up({ salaryStructureId: x.target.value || undefined })}>
              <option value="">Not assigned</option>
              {s.salaryStructures.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </Select>
          </Field>
          <Field label="Basic Salary Override" error={err.basicSalary} hint="Leave empty to use the structure's basic.">
            <Input type="number" min={0} value={e.basicSalary ?? ""} onChange={(x) => up({ basicSalary: x.target.value ? +x.target.value : undefined })} />
          </Field>
          <Field label="EPF Number" error={err.epfNo}><Input value={e.epfNo ?? ""} onChange={(x) => up({ epfNo: x.target.value })} /></Field>
          <Field label="Bank Name" error={err.bankName}><Input value={e.bankName ?? ""} onChange={(x) => up({ bankName: x.target.value })} /></Field>
          <Field label="Bank Account No." error={err.bankAccount}><Input value={e.bankAccount ?? ""} onChange={(x) => up({ bankAccount: x.target.value })} /></Field>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button icon={Save} onClick={save} disabled={busy}>{busy ? "Saving…" : existing ? "Save Changes" : "Create Employee"}</Button>
      </div>
    </div>
  );
}
