import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() { return <main className="loading-page"><div className="loading-panel"><Skeleton className="h-12 w-full" /><Skeleton className="h-20 w-4/5" /><Skeleton className="ml-auto h-14 w-2/3" /><Skeleton className="mt-auto h-24 w-full" /></div></main>; }
