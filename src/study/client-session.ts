import type { StudyMode } from "../../types/study.ts";

export const SESSION_STORAGE_KEY = "ideon.study.session.v1";
const CONSENT_STORAGE_KEY = "ideon.study.consent.v1";
const MODE_STORAGE_KEY = "ideon.study.mode.v1";

export interface ClientStudySession { sessionId: string; sessionToken: string; sessionCode: string; participantCode: string; mode?: StudyMode }

export function readClientSession(): ClientStudySession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "null") as Partial<ClientStudySession> | null;
    return value?.sessionId && value.sessionToken && value.sessionCode && value.participantCode ? value as ClientStudySession : null;
  } catch { return null; }
}

export function writeClientSession(value: ClientStudySession) { window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(value)); }
export function readClientStudyMode(): StudyMode {
  if (typeof window === "undefined") return "random";
  const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
  if (stored === "random" || stored === "adaptive") return stored;
  return readClientSession()?.mode ?? "random";
}
export function writeClientStudyMode(mode: StudyMode) {
  if (typeof window !== "undefined") window.localStorage.setItem(MODE_STORAGE_KEY, mode);
}
export function clearClientSession() { if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_STORAGE_KEY); }
export function writeClientConsent() { if (typeof window !== "undefined") window.sessionStorage.setItem(CONSENT_STORAGE_KEY, "confirmed"); }
export function hasClientConsent() { return typeof window !== "undefined" && window.sessionStorage.getItem(CONSENT_STORAGE_KEY) === "confirmed"; }
export function clearClientConsent() { if (typeof window !== "undefined") window.sessionStorage.removeItem(CONSENT_STORAGE_KEY); }
