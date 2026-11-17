"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Download, Eye, Pencil, Plus, Users } from "lucide-react";
import { Avatar, Button, Card, DataTable, EmptyState, IconBtn, PageHeader, Select, StatusBadge } from "@/components/ui";
import { empName, useStore } from "@/lib/store";
import { downloadCSV } from "@/lib/format";

export default function EmployeesPage() {
  const router = useRouter();
  const s = useStore();
  const [dep, setDep] = useState("");
  const [status, setStatus] = useState("");
  const dName = (id: string) => s.departments.find((d) => d.id === id)?.name ?? "—";
  const gName = (id: string) => s.designations.find((d) => d.id === id)?.name ?? "—";
  const rows = useMemo(
    () => s.employees.filter((e) => (!dep || e.departmentId === dep) && (!status || e.status === status)).sort((a, b) => a.empNo.localeCompare(b.empNo)),
    [s.employees, dep, status],
  );

  return (
    <div>
      <PageHeader title="Employees" subtitle={`${s.employees.length} employee records`} actions={
        <>
          <Button variant="secondary" icon={Download} disabled={!rows.length} onClick={() => downloadCSV("employees.csv", [
            ["Emp ID", "Name", "NIC", "Department", "Designation", "Phone", "Email", "Join Date", "Status"],
            ...rows.map((e) => [e.empNo, empName(e), e.nic, dName(e.departmentId), gName(e.designationId), e.phone, e.email, e.joinDate, e.status]),
          ])}>Export</Button>
          <Link href="/employees/new"><Button icon={Plus}>Add Employee</Button></Link>
        </>
      } />
      <Card>
        <DataTable
          rows={rows}
          selectable
          onRowClick={(e) => router.push(`/employees/${e.id}`)}
          searchText={(e) => `${e.empNo} ${empName(e)} ${e.nic} ${e.email}`}
          toolbar={
            <>
              <Select value={dep} onChange={(e) => setDep(e.target.value)} className="w-auto">
                <option value="">All departments</option>
                {s.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
                <option value="">All statuses</option><option>Active</option><option>Inactive</option>
              </Select>
            </>
          }
          empty={
            <EmptyState icon={Users} title={s.employees.length ? "No matching employees" : "No employees yet"}
              text={s.employees.length ? "Try a different search or filter." : "Add your first employee to get started."}
              action={!s.employees.length && <Link href="/employees/new"><Button icon={Plus}>Add Employee</Button></Link>} />
          }
          columns={[
            { key: "id", header: "Emp ID", render: (e) => <span className="font-medium text-slate-800">{e.empNo}</span> },
            { key: "name", header: "Name", render: (e) => <div className="flex items-center gap-3"><Avatar name={empName(e)} size={32} /><span className="font-medium text-slate-800">{empName(e)}</span></div> },
            { key: "dep", header: "Department", render: (e) => dName(e.departmentId) },
            { key: "des", header: "Designation", render: (e) => gName(e.designationId) },
            { key: "st", header: "Status", render: (e) => <StatusBadge status={e.status} /> },
            { key: "a", header: "Actions", className: "text-right", render: (e) => (
              <>
                <IconBtn icon={Eye} label="View" onClick={() => router.push(`/employees/${e.id}`)} />
                <IconBtn icon={Pencil} label="Edit" onClick={() => router.push(`/employees/${e.id}/edit`)} />
              </>
            ) },
          ]}
        />
      </Card>
    </div>
  );
}
