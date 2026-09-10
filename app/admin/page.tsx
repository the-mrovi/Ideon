import type { Metadata } from "next";
import Link from "next/link";
import { IdeonBrand } from "@/components/brand/ideon-brand";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

export const metadata: Metadata = { title: "Researcher Sign In" };
export default function AdminLoginPage() {
  return <main className="admin-login-page"><header><IdeonBrand /><Link href="/">Participant experience</Link></header><div className="admin-login-grid"><section className="admin-login-context"><span>Ideon research console</span><h2>Study activity, thoughtfully organised.</h2><p>Review participant sessions, research outcomes, questionnaire responses, and experimental logs from one focused workspace.</p><div className="data-note"><strong>Participant privacy first</strong><p>Session references are anonymous and participant-facing interfaces never expose internal study conditions.</p></div></section><AdminLoginForm /></div></main>;
}
