import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() { return <main className="admin-loading"><Skeleton className="h-20 w-80 max-w-full" /><div>{[1,2,3,4].map((n) => <Skeleton key={n} className="h-36" />)}</div><Skeleton className="h-96 w-full" /></main>; }
