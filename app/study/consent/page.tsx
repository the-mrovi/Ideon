import type { Metadata } from "next";
import { StudyShell } from "@/components/layout/study-shell";
import { ConsentForm } from "@/components/study/consent-form";

export const metadata: Metadata = { title: "Research Consent" };
export default function ConsentPage() { return <StudyShell showProgress={false}><ConsentForm /></StudyShell>; }
