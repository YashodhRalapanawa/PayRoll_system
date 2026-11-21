"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { AuthSplitLayout } from "@/components/layout/AuthSplitLayout";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { passwordSchema } from "@/lib/validation";

/** Reached from the reset email via /auth/callback, which signs the user in first. */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) return setErr(pw.error.issues[0].message);
    if (confirm !== password) return setErr("Passwords do not match.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setErr(/session/i.test(error.message) ? "This reset link has expired. Request a new one." : error.message);
    router.replace("/");
    router.refresh();
  }

  return (
    <AuthSplitLayout>
      <form onSubmit={submit} className="mx-auto w-full max-w-sm space-y-4">
        <h1 className="mb-6 text-center text-2xl font-bold text-slate-900">Choose a New Password</h1>
        {err && <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        <Field hint="At least 8 characters with a letter and a number."><Input icon={Lock} type="password" placeholder="New Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" maxLength={72} /></Field>
        <Input icon={Lock} type="password" placeholder="Confirm Password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" maxLength={72} />
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save Password"}</Button>
      </form>
    </AuthSplitLayout>
  );
}
