"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminLoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <form className="admin-login-form" onSubmit={(event) => { event.preventDefault(); setLoading(true); window.setTimeout(() => router.push("/admin/dashboard"), 500); }}>
      <div className="admin-login-icon"><LockKeyhole /></div><span className="admin-login-kicker">Research access</span><h1>Sign in to Ideon</h1><p>Use your researcher credentials to access session data.</p>
      <div className="field-group"><label htmlFor="admin-email">Email address</label><Input id="admin-email" type="email" placeholder="researcher@university.edu" required autoComplete="email" /></div>
      <div className="field-group"><label htmlFor="admin-password">Password</label><Input id="admin-password" type="password" placeholder="Enter your password" required autoComplete="current-password" /></div>
      <Button type="submit" className="admin-login-button" disabled={loading}>{loading ? "Signing in…" : <>Sign in <ArrowRight /></>}</Button>
      <small>Mock authentication is enabled for Part 1. Any valid-looking credentials will continue.</small>
    </form>
  );
}
