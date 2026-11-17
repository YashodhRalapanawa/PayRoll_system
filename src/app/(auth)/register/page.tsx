"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Lock, Mail, User } from "lucide-react";
import { AuthSplitLayout } from "@/components/layout/AuthSplitLayout";
import { Button, Checkbox, Field, Input } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function RegisterPage() {
  const router = useRouter();
  const register = useStore((s) => s.register);
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "" });
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.name.trim()) er.name = "Full name is required.";
    if (!/^\S+@\S+\.\S+$/.test(f.email)) er.email = "Enter a valid email address.";
    if (f.password.length < 8) er.password = "Password must be at least 8 characters.";
    if (f.confirm !== f.password) er.confirm = "Passwords do not match.";
    if (!agree) er.agree = "You must accept the Terms & Conditions.";
    setErr(er);
    if (Object.keys(er).length) return;
    const r = register({ name: f.name, email: f.email, password: f.password });
    if (!r.ok) return setErr({ email: r.error! });
    router.push("/setup");
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <AuthSplitLayout>
      <form onSubmit={submit} className="mx-auto w-full max-w-sm space-y-4" noValidate>
        <h1 className="mb-6 text-center text-2xl font-bold text-slate-900">Create Your Account</h1>
        <Field error={err.name}><Input icon={User} placeholder="Full Name" value={f.name} onChange={set("name")} autoComplete="name" /></Field>
        <Field error={err.email}><Input icon={Mail} type="email" placeholder="Email Address" value={f.email} onChange={set("email")} autoComplete="email" /></Field>
        <Field error={err.password}><Input icon={Lock} type="password" placeholder="Password" value={f.password} onChange={set("password")} autoComplete="new-password" /></Field>
        <Field error={err.confirm}><Input icon={Lock} type="password" placeholder="Confirm Password" value={f.confirm} onChange={set("confirm")} autoComplete="new-password" /></Field>
        <div>
          <Checkbox checked={agree} onChange={setAgree} label={<span>I agree to the <a className="font-medium text-brand-600 hover:underline">Terms &amp; Conditions</a></span>} />
          {err.agree && <p className="mt-1 text-xs text-rose-600">{err.agree}</p>}
        </div>
        <Button type="submit" className="w-full">Create Account</Button>
        <p className="text-center text-sm text-slate-500">
          Already have an account? <Link href="/login" className="font-semibold text-brand-600 hover:underline">Sign In</Link>
        </p>
      </form>
    </AuthSplitLayout>
  );
}
