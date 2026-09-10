import Link from "next/link";
import { BarChart3, LogOut, MessageSquareText, UsersRound } from "lucide-react";
import { IdeonBrand } from "@/components/brand/ideon-brand";

export function AdminShell({ children, active = "overview" }: { children: React.ReactNode; active?: "overview" | "sessions" }) {
  return (
    <main className="admin-app">
      <aside className="admin-sidebar">
        <div><IdeonBrand href="/admin/dashboard" /><span className="admin-caption">Research console</span></div>
        <nav aria-label="Admin navigation">
          <Link className={active === "overview" ? "active" : ""} href="/admin/dashboard"><BarChart3 /> Overview</Link>
          <Link className={active === "sessions" ? "active" : ""} href="/admin/dashboard#sessions"><UsersRound /> Sessions</Link>
        </nav>
        <Link href="/admin" className="admin-signout"><LogOut /> Sign out</Link>
      </aside>
      <div className="admin-main">
        <header className="admin-mobile-header"><IdeonBrand compact /><Link href="/admin/dashboard"><MessageSquareText /><span className="sr-only">Dashboard</span></Link></header>
        {children}
      </div>
    </main>
  );
}
