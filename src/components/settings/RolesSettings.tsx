"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Mail, Trash2, X } from "lucide-react";
import { Avatar, Button, Card, DataTable, EmptyState, IconBtn, Input, Select } from "@/components/ui";
import { cancelInvite, inviteUser, listRoles, setRole } from "@/lib/api/hr";
import { errorMessage } from "@/lib/api/client";
import { fmtDate } from "@/lib/format";
import { useCan, useCurrentUser } from "@/lib/store";
import type { Invite, RoleLabel, User } from "@/lib/types";

const ROLES: RoleLabel[] = ["Administrator", "HR Manager", "Viewer"];

/** Mirrors the server-side role checks (lib/auth/guard.ts ROLES) and RLS policies. */
const PERMS: [string, boolean, boolean, boolean][] = [
  ["View dashboard & reports", true, true, true],
  ["Manage employees & documents", true, true, false],
  ["Organization (branches, departments)", true, true, false],
  ["Attendance & shifts", true, true, false],
  ["Approve leave", true, true, false],
  ["Salary structures", true, false, false],
  ["Process & approve payroll", true, false, false],
  ["Company settings, users & roles", true, false, false],
];

/** A4 · Settings › Roles & Permissions. */
export function RolesSettings({ show }: { show: (m: string) => void }) {
  const me = useCurrentUser();
  const can = useCan();
  const [users, setUsers] = useState<User[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRoleChoice] = useState<RoleLabel>("Viewer");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listRoles()
      .then((r) => { setUsers(r.users); setInvites(r.invites); })
      .catch((e) => { setUsers([]); show(errorMessage(e)); });
  }, [show]);
  useEffect(load, [load]);

  async function changeRole(u: User, next: RoleLabel) {
    try {
      const saved = await setRole(u.id, next);
      setUsers((list) => (list ?? []).map((x) => (x.id === saved.id ? saved : x)));
      show("Role updated");
    } catch (e) {
      show(errorMessage(e));
    }
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const inv = await inviteUser(email, role);
      setInvites((list) => [inv, ...list]);
      setEmail("");
      show(`Invite saved. ${inv.email} joins when they register with that email.`);
    } catch (x) {
      show(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card title="Users">
        <DataTable rows={users ?? []} empty={<EmptyState icon={Mail} title={users ? "No users" : "Loading…"} />} columns={[
          { key: "n", header: "User", render: (u) => <div className="flex items-center gap-3"><Avatar name={u.name} size={32} /><div><div className="font-medium">{u.name}{u.id === me?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}</div><div className="text-xs text-slate-400">{u.email}</div></div></div> },
          { key: "r", header: "Role", render: (u) => (
            <Select className="w-44 py-1.5" value={u.role} disabled={!can.admin || u.id === me?.id} onChange={(e) => changeRole(u, e.target.value as RoleLabel)}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </Select>
          ) },
        ]} />
        <p className="px-5 pb-5 text-xs text-slate-500">You cannot change your own role. Only administrators can change roles.</p>
      </Card>

      {can.admin && (
        <Card title="Invite a user">
          <form onSubmit={invite} className="flex flex-wrap items-end gap-3 p-5">
            <div className="min-w-56 flex-1"><Input icon={Mail} type="email" required maxLength={254} placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <Select className="w-44" value={role} onChange={(e) => setRoleChoice(e.target.value as RoleLabel)}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </Select>
            <Button type="submit" disabled={busy || !email.trim()}>{busy ? "Saving…" : "Invite"}</Button>
          </form>
          <p className="-mt-2 px-5 pb-4 text-xs text-slate-500">The person registers with this exact email and confirms it; they then join your company with this role.</p>
          {invites.length > 0 && (
            <DataTable rows={invites} columns={[
              { key: "e", header: "Pending invite", render: (i) => i.email },
              { key: "r", header: "Role", render: (i) => i.role },
              { key: "d", header: "Invited", render: (i) => fmtDate(i.createdAt) },
              { key: "x", header: "", className: "text-right", render: (i) => <IconBtn icon={Trash2} tone="danger" label="Cancel invite" onClick={async () => {
                try { await cancelInvite(i.id); setInvites((list) => list.filter((x) => x.id !== i.id)); } catch (e) { show(errorMessage(e)); }
              }} /> },
            ]} />
          )}
        </Card>
      )}

      <Card title="Permission Matrix">
        <div className="overflow-x-auto p-5">
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2">Permission</th><th>Administrator</th><th>HR Manager</th><th>Viewer</th></tr></thead>
            <tbody>
              {PERMS.map(([p, ...r]) => (
                <tr key={p} className="border-t border-slate-100">
                  <td className="py-2.5 text-slate-700">{p}</td>
                  {r.map((v, i) => <td key={i}>{v ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-slate-300" />}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">Enforced on the server and by database row-level security.</p>
        </div>
      </Card>
    </div>
  );
}
