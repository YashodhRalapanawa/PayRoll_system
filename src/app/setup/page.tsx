"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Check, ImagePlus, X } from "lucide-react";
import { Button, Field, Input, Select, Stepper, Textarea } from "@/components/ui";
import { Spinner } from "@/components/layout/AppShell";
import { Logo } from "@/components/layout/Logo";
import { useHydrated, useStore } from "@/lib/store";
import { COUNTRIES, findCountry } from "@/lib/countries";
import { uid } from "@/lib/format";
import type { Company } from "@/lib/types";

const STEPS = ["Company", "Country & Currency", "Store / Branch", "Complete"];

export default function SetupPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const st = useStore();
  const [step, setStep] = useState(0);
  const [c, setC] = useState<Company>({
    name: "", email: "", phone: "", address: "", logo: undefined,
    country: "Sri Lanka", currencyCode: "LKR", currencySymbol: "Rs.", currencyName: "Sri Lankan Rupee",
  });
  const [b, setB] = useState({ name: "Main Branch", code: "ST001", address: "", contact: "" });
  const [err, setErr] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!st.sessionUserId) router.replace("/login");
    else if (st.setupComplete && step !== 3) router.replace("/dashboard");
    if (!loaded.current) {
      loaded.current = true;
      if (st.company) setC(st.company);
      if (st.branches[0]) setB(st.branches[0]);
    }
  }, [hydrated, st.sessionUserId, st.setupComplete, st.company, st.branches, router, step]);

  if (!hydrated || !st.sessionUserId) return <Spinner />;

  const country = findCountry(c.country);

  function onLogo(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) return setErr({ logo: "Logo must be PNG or JPG." });
    if (file.size > 2 * 1024 * 1024) return setErr({ logo: "Logo must be 2MB or smaller." });
    const r = new FileReader();
    r.onload = () => { setC((x) => ({ ...x, logo: r.result as string })); setErr({}); };
    r.readAsDataURL(file);
  }

  function next() {
    const er: Record<string, string> = {};
    if (step === 0) {
      if (!c.name.trim()) er.name = "Company name is required.";
      if (!/^\S+@\S+\.\S+$/.test(c.email)) er.email = "Enter a valid email.";
      if (!c.phone.trim()) er.phone = "Phone number is required.";
      if (!c.address.trim()) er.address = "Business address is required.";
    }
    if (step === 2) {
      if (!b.name.trim()) er.bname = "Store name is required.";
      if (!b.code.trim()) er.bcode = "Store code is required.";
      if (!b.address.trim()) er.baddress = "Store address is required.";
      if (!b.contact.trim()) er.bcontact = "Contact number is required.";
    }
    setErr(er);
    if (Object.keys(er).length) return;
    if (step < 2) {
      st.saveCompany(c);
      setStep(step + 1);
    } else if (step === 2) {
      st.saveCompany(c);
      const existing = st.branches[0];
      st.upsert("branches", { id: existing?.id ?? uid(), ...b });
      st.completeSetup();
      st.log("settings", "Company setup completed", `${c.name} is ready to use.`);
      setStep(3);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-indigo-50 p-4 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <Logo dark={false} />
          <button onClick={() => { st.logout(); router.replace("/login"); }} className="cursor-pointer text-sm text-slate-500 hover:text-slate-800">Sign out</button>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-xl shadow-brand-600/5 sm:p-10">
          <h1 className="text-2xl font-bold text-slate-900">Company Setup</h1>
          <p className="mt-1 text-sm text-slate-500">Set up your organization details</p>
          <div className="my-8"><Stepper steps={STEPS} current={step} /></div>

          {step === 0 && (
            <div className="grid gap-6 md:grid-cols-[1fr_220px]">
              <div className="space-y-4">
                <Field label="Company Name" required error={err.name}><Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="ABC Trading (Pvt) Ltd" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Business Email" required error={err.email}><Input type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} placeholder="info@company.lk" /></Field>
                  <Field label="Phone Number" required error={err.phone}><Input value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} placeholder="011 234 5678" /></Field>
                </div>
                <Field label="Business Address" required error={err.address}><Textarea value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} placeholder="No. 123, Main Street, Colombo 03" /></Field>
              </div>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Company Logo</span>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); onLogo(e.dataTransfer.files[0]); }}
                  className="relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-500 hover:border-brand-300 hover:bg-brand-50/50"
                >
                  {c.logo ? <img src={c.logo} alt="Logo" className="h-full w-full object-contain p-4" /> : <><ImagePlus className="h-8 w-8 text-brand-500" /><span className="text-sm font-medium">Upload Logo</span></>}
                </button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => onLogo(e.target.files?.[0])} />
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>PNG, JPG (Max 2MB)</span>
                  {c.logo && <button onClick={() => setC({ ...c, logo: undefined })} className="flex cursor-pointer items-center gap-1 text-rose-500"><X className="h-3 w-3" /> Remove</button>}
                </div>
                {err.logo && <p className="mt-1 text-xs text-rose-600">{err.logo}</p>}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Select Country" required>
                  <Select
                    value={c.country}
                    onChange={(e) => {
                      const k = findCountry(e.target.value);
                      setC({ ...c, country: k.name, currencyCode: k.code, currencySymbol: k.symbol, currencyName: k.currency });
                    }}
                  >
                    {COUNTRIES.map((k) => <option key={k.name} value={k.name}>{k.flag} {k.name}</option>)}
                  </Select>
                </Field>
                <Field label="Currency" required hint="Currency follows the selected country.">
                  <Input value={`${country.code} – ${country.currency}`} disabled />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {[["Currency Code", c.currencyCode], ["Currency Symbol", c.currencySymbol], ["Currency Name", c.currencyName]].map(([l, v]) => (
                  <div key={l} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                    <div className="text-sm text-slate-500">{l}</div>
                    <div className="mt-1 text-xl font-bold text-slate-900">{v}</div>
                  </div>
                ))}
              </div>
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800">Sri Lankan payroll (EPF/ETF) is the initial target. Statutory rates for other countries must be configured in Settings.</p>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Store Name" required error={err.bname}><Input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} /></Field>
              <Field label="Store Code" required error={err.bcode}><Input value={b.code} onChange={(e) => setB({ ...b, code: e.target.value })} /></Field>
              <Field label="Store Address" required error={err.baddress}><Textarea value={b.address} onChange={(e) => setB({ ...b, address: e.target.value })} placeholder="No. 123, Main Street, Colombo 03" /></Field>
              <Field label="Contact Number" required error={err.bcontact}><Input value={b.contact} onChange={(e) => setB({ ...b, contact: e.target.value })} placeholder="011 234 5678" /></Field>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center py-8 text-center">
              <CheckCircle2 className="h-16 w-16 text-emerald-500" />
              <h2 className="mt-4 text-xl font-bold text-slate-900">You&apos;re all set!</h2>
              <p className="mt-1 max-w-md text-sm text-slate-500">{c.name} has been set up with {c.currencyCode} currency and the {b.name} branch. Next, add departments and employees.</p>
              <Button className="mt-6" icon={ArrowRight} onClick={() => router.push("/dashboard")}>Go to Dashboard</Button>
            </div>
          )}

          {step < 3 && (
            <div className="mt-10 flex justify-end gap-3">
              {step === 0 ? (
                <Button variant="secondary" onClick={() => { st.logout(); router.replace("/login"); }}>Cancel</Button>
              ) : (
                <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button>
              )}
              {step < 2 ? (
                <Button onClick={next}>Next <ArrowRight className="h-4 w-4" /></Button>
              ) : (
                <Button onClick={next} icon={Check}>Complete Setup</Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
