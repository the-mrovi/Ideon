import Link from "next/link";
import { BarChart3, Download, MessageSquareText, Settings2, UsersRound } from "lucide-react";
import { IdeonBrand } from "@/components/brand/ideon-brand";

export function AdminShell({ children, active = "overview" }: { children: React.ReactNode; active?: "overview" | "sessions" | "config" }) {
  return (
    <main className="admin-app">
      <aside className="admin-sidebar">
        <div><IdeonBrand href="/admin/dashboard" /><span className="admin-caption">Research console</span></div>
        <nav aria-label="Admin navigation">
          <Link className={active === "overview" ? "active" : ""} href="/admin/dashboard"><BarChart3 /> Overview</Link>
          <Link className={active === "sessions" ? "active" : ""} href="/admin/dashboard#sessions"><UsersRound /> Sessions</Link>
          <Link className={active === "config" ? "active" : ""} href="/admin/config"><Settings2 /> Configuration</Link>
        </nav>
        <div><Link href="/api/admin/export/sessions" className="admin-signout"><Download /> Export CSV</Link><form action="/api/admin/logout" method="post"><button className="admin-signout" type="submit">Sign out</button></form></div>
      </aside>
      <div className="admin-main">
        <header className="admin-mobile-header"><IdeonBrand compact /><Link href="/admin/dashboard"><MessageSquareText /><span className="sr-only">Dashboard</span></Link></header>
        {children}
      </div>
    </main>
  );
}
