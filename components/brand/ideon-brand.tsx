import Link from "next/link";

export function IdeonMark({ className = "" }: { className?: string }) {
  return <span className={`ideon-mark ${className}`} aria-hidden="true"><span /><span /><span /></span>;
}

export function IdeonBrand({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className={`brand-lockup ${compact ? "brand-compact" : ""}`} aria-label="Ideon home">
      <IdeonMark /><span>Ideon</span>
    </Link>
  );
}
