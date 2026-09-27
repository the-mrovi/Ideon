"use client";

import { LockKeyhole } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StudyMode } from "@/types/study";

interface StudyModeSelectorProps {
  value: StudyMode;
  onValueChange?: (value: StudyMode) => void;
  locked?: boolean;
  compact?: boolean;
}

function isStudyMode(value: string): value is StudyMode {
  return value === "random" || value === "adaptive";
}

export function StudyModeSelector({ value, onValueChange, locked = false, compact = false }: StudyModeSelectorProps) {
  return (
    <div className={`study-mode-control ${compact ? "is-compact" : ""} ${locked ? "is-locked" : ""}`}>
      {!compact ? <div className="study-mode-copy"><label htmlFor="ideon-study-mode">Study mode</label><p>Select the mode assigned by your researcher. It locks when ideation begins.</p></div> : <span className="sr-only">Study mode, locked for this session</span>}
      <div className="study-mode-select-wrap">
        {locked ? <LockKeyhole aria-hidden="true" /> : null}
        <Select value={value} disabled={locked} onValueChange={(next) => { if (isStudyMode(next)) onValueChange?.(next); }}>
          <SelectTrigger id="ideon-study-mode" className="study-mode-trigger" aria-label={locked ? `Study mode: ${value}. Locked for this session.` : "Study mode"} title={locked ? "Mode locked for this session" : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="study-mode-menu" position="popper" align="end">
            <SelectItem value="random">Random</SelectItem>
            <SelectItem value="adaptive">Adaptive</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
