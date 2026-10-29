import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { redirect } from "next/navigation";
import { AdminSettings } from "@/components/admin-settings";

export default async function AdminPage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) redirect("/");

  return (
    <main className="admin-page">
      <header>
        <p className="eyebrow">THE CANVASIUM</p>
        <h1>Administration</h1>
        <p>Configure the server-side planner. Provider credentials remain in environment secrets.</p>
      </header>
      <AdminSettings />
    </main>
  );
}
