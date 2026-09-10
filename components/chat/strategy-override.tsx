"use client";

import { Button } from "@/components/ui/button";

export function StrategyOverride({ enabled = false }: { enabled?: boolean }) {
  if (!enabled) return null;
  return (
    <div className="strategy-override" aria-label="Conversation direction">
      <Button variant="outline" size="sm">Show other directions</Button>
      <Button variant="outline" size="sm">Develop this further</Button>
      <Button variant="outline" size="sm">Let me think</Button>
    </div>
  );
}
