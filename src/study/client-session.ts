export const SESSION_STORAGE_KEY = "ideon.study.session.v1";

export interface ClientStudySession { sessionId: string; sessionToken: string; sessionCode: string; participantCode: string }

export function readClientSession(): ClientStudySession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "null") as Partial<ClientStudySession> | null;
    return value?.sessionId && value.sessionToken && value.sessionCode && value.participantCode ? value as ClientStudySession : null;
  } catch { return null; }
}

export function writeClientSession(value: ClientStudySession) { window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(value)); }
export function clearClientSession() { if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_STORAGE_KEY); }
