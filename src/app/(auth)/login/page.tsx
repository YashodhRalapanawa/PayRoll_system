"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Lock, Mail } from "lucide-react";
import { AuthSplitLayout } from "@/components/layout/AuthSplitLayout";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(sp.get("error") === "link" ? "That link is invalid or has expired. Please try again." : "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      // One generic message so the form does not reveal which emails have accounts.
      setErr(/confirm/i.test(error.message) ? "Please confirm your email address first. Check your inbox." : "Invalid email or password.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-sm space-y-4">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Welcome Back</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to your account</p>
      </div>
      {err && <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      <Input icon={Mail} type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
      <Input icon={Lock} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={72} required />
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">Forgot Password?</Link>
      </div>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign In"}</Button>
      <p className="text-center text-sm text-slate-500">
        Don&apos;t have an account? <Link href="/register" className="font-semibold text-brand-600 hover:underline">Register</Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthSplitLayout>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthSplitLayout>
  );
}
