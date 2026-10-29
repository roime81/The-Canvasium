import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="login-page">
      <section className="login-card">
        <p className="eyebrow">THE CANVASIUM</p>
        <h1>Make space for your best work.</h1>
        <p>Sign in to create, save, and manage your canvas.</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="google-sign-in" type="submit">Continue with Google</button>
        </form>
      </section>
    </main>
  );
}
