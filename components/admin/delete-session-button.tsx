"use client";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export function DeleteSessionButton({ id }: { id: string }) {
  const router = useRouter();
  const remove = async () => { const response = await fetch(`/api/admin/sessions/${id}`, { method: "DELETE" }); if (response.ok) router.push("/admin/dashboard"); };
  return <AlertDialog><AlertDialogTrigger asChild><Button variant="outline"><Trash2 /> Delete test session</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this development session?</AlertDialogTitle><AlertDialogDescription>This permanently deletes the session and its anonymous participant record. Main-study data cannot be deleted here.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={remove}>Delete permanently</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
