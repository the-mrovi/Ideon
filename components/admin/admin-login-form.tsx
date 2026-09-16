"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminLoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      if (!response.ok) throw new Error();
      router.push("/admin/dashboard"); router.refresh();
    } catch { setError("The credentials are invalid or this account is not an approved researcher."); }
    finally { setLoading(false); }
  };
  return (
    <form className="admin-login-form" onSubmit={submit}>
      <div className="admin-login-icon"><LockKeyhole /></div><span className="admin-login-kicker">Research access</span><h1>Sign in to Ideon</h1><p>Use your researcher credentials to access session data.</p>
      <div className="field-group"><label htmlFor="admin-email">Email address</label><Input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="researcher@university.edu" required autoComplete="email" /></div>
      <div className="field-group"><label htmlFor="admin-password">Password</label><Input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required autoComplete="current-password" /></div>
      {error ? <p className="validation-message" role="alert">{error}</p> : null}
      <Button type="submit" className="admin-login-button" disabled={loading}>{loading ? "Signing in…" : <>Sign in <ArrowRight /></>}</Button>
      <small>Access is restricted to approved Supabase researcher accounts.</small>
    </form>
  );
}
