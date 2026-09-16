"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ConfigActions({ id, active, frozen }: { id: string; active: boolean; frozen: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  const act = async (action: "freeze" | "activate") => { setBusy(true); const response = await fetch("/api/admin/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, configId: id }) }); setBusy(false); if (response.ok) router.refresh(); };
  return <div className="split-actions">{!frozen ? <Button variant="outline" disabled={busy} onClick={() => act("freeze")}>Freeze</Button> : null}{!active ? <Button disabled={busy} onClick={() => act("activate")}>Activate</Button> : <span className="study-live"><i /> Active</span>}</div>;
}
