"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Lock, Mail, MailCheck, User } from "lucide-react";
import { AuthSplitLayout } from "@/components/layout/AuthSplitLayout";
import { Button, Checkbox, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { passwordSchema } from "@/lib/validation";

export default function RegisterPage() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "" });
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.name.trim()) er.name = "Full name is required.";
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) er.email = "Enter a valid email address.";
    const pw = passwordSchema.safeParse(f.password);
    if (!pw.success) er.password = pw.error.issues[0].message;
    if (f.confirm !== f.password) er.confirm = "Passwords do not match.";
    if (!agree) er.agree = "You must accept the Terms & Conditions.";
    setErr(er);
    if (Object.keys(er).length) return;

    setBusy(true);
    const { data, error } = await createClient().auth.signUp({
      email: f.email.trim().toLowerCase(),
      password: f.password,
      options: {
        data: { full_name: f.name.trim().slice(0, 120) },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/setup`,
      },
    });
    setBusy(false);
    if (error) {
      setErr({ form: /password/i.test(error.message) ? error.message : "Could not create the account. Please try again." });
      return;
    }
    if (data.session) {
      router.replace("/");
      router.refresh();
    } else {
      // Email confirmation is on. Supabase gives the same answer for existing
      // emails, so this screen does not reveal whether an account exists.
      setSent(true);
    }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  if (sent)
    return (
      <AuthSplitLayout>
        <div className="mx-auto max-w-sm space-y-4 text-center">
          <MailCheck className="mx-auto h-12 w-12 text-brand-600" />
          <h1 className="text-2xl font-bold text-slate-900">Check your email</h1>
          <p className="text-sm text-slate-500">We sent a confirmation link to <b>{f.email.trim()}</b>. Open it to activate your account, then continue to company setup.</p>
          <Link href="/login" className="inline-block text-sm font-semibold text-brand-600 hover:underline">Back to sign in</Link>
        </div>
      </AuthSplitLayout>
    );

  return (
    <AuthSplitLayout>
      <form onSubmit={submit} className="mx-auto w-full max-w-sm space-y-4" noValidate>
        <h1 className="mb-6 text-center text-2xl font-bold text-slate-900">Create Your Account</h1>
        {err.form && <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err.form}</div>}
        <Field error={err.name}><Input icon={User} placeholder="Full Name" value={f.name} onChange={set("name")} autoComplete="name" maxLength={120} /></Field>
        <Field error={err.email}><Input icon={Mail} type="email" placeholder="Email Address" value={f.email} onChange={set("email")} autoComplete="email" maxLength={254} /></Field>
        <Field error={err.password} hint="At least 8 characters with a letter and a number."><Input icon={Lock} type="password" placeholder="Password" value={f.password} onChange={set("password")} autoComplete="new-password" maxLength={72} /></Field>
        <Field error={err.confirm}><Input icon={Lock} type="password" placeholder="Confirm Password" value={f.confirm} onChange={set("confirm")} autoComplete="new-password" maxLength={72} /></Field>
        <div>
          <Checkbox checked={agree} onChange={setAgree} label={<span>I agree to the <a className="font-medium text-brand-600 hover:underline">Terms &amp; Conditions</a></span>} />
          {err.agree && <p className="mt-1 text-xs text-rose-600">{err.agree}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating account…" : "Create Account"}</Button>
        <p className="text-center text-sm text-slate-500">
          Already have an account? <Link href="/login" className="font-semibold text-brand-600 hover:underline">Sign In</Link>
        </p>
      </form>
    </AuthSplitLayout>
  );
}
