import Link from "next/link";
import { Check, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CompletionCard() {
  return (
    <section className="completion-card"><div className="completion-icon"><Check /></div><span className="completion-label">Response recorded</span><h1>Session complete</h1><p>Thank you for completing the Ideon research session. Your contribution will help us better understand human–AI research ideation.</p><div className="session-reference"><div><span>Anonymous session reference</span><strong>IDN-A7F3</strong></div><LockKeyhole /></div><p className="completion-note">You may now close this window or return to the study coordinator.</p><Button asChild variant="outline"><Link href="/">Return to Ideon</Link></Button></section>
  );
}
