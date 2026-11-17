"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Lock, Mail } from "lucide-react";
import { AuthSplitLayout } from "@/components/layout/AuthSplitLayout";
import { Button, Checkbox, Input } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const login = useStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    setInfo("");
    const r = login(email, password);
    if (!r.ok) return setErr(r.error!);
    router.push(useStore.getState().setupComplete ? "/dashboard" : "/setup");
  }

  return (
    <AuthSplitLayout>
      <form onSubmit={submit} className="mx-auto w-full max-w-sm space-y-4">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Welcome Back</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to your account</p>
        </div>
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        {info && <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{info}</div>}
        <Input icon={Mail} type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <Input icon={Lock} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        <div className="flex items-center justify-between">
          <Checkbox checked={remember} onChange={setRemember} label="Remember me" />
          <button type="button" onClick={() => setInfo("Password reset will be available once email delivery is connected.")} className="cursor-pointer text-sm font-medium text-brand-600 hover:underline">
            Forgot Password?
          </button>
        </div>
        <Button type="submit" className="w-full">Sign In</Button>
        <p className="text-center text-sm text-slate-500">
          Don&apos;t have an account? <Link href="/register" className="font-semibold text-brand-600 hover:underline">Register</Link>
        </p>
      </form>
    </AuthSplitLayout>
  );
}
