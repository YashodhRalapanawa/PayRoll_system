"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Mail, MailCheck } from "lucide-react";
import { AuthSplitLayout } from "@/components/layout/AuthSplitLayout";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await createClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    // Always the same message, whether or not the email has an account.
    setSent(true);
  }

  return (
    <AuthSplitLayout>
      {sent ? (
        <div className="mx-auto max-w-sm space-y-4 text-center">
          <MailCheck className="mx-auto h-12 w-12 text-brand-600" />
          <h1 className="text-2xl font-bold text-slate-900">Check your email</h1>
          <p className="text-sm text-slate-500">If an account exists for that address, we sent a link to reset the password.</p>
          <Link href="/login" className="inline-block text-sm font-semibold text-brand-600 hover:underline">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mx-auto w-full max-w-sm space-y-4">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-slate-900">Reset Password</h1>
            <p className="mt-1 text-sm text-slate-500">Enter your email and we&apos;ll send you a reset link.</p>
          </div>
          <Input icon={Mail} type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send Reset Link"}</Button>
          <p className="text-center text-sm text-slate-500"><Link href="/login" className="font-semibold text-brand-600 hover:underline">Back to sign in</Link></p>
        </form>
      )}
    </AuthSplitLayout>
  );
}
