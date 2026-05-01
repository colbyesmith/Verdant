import { auth } from "@/auth";
import { PrimaryNav } from "./verdant/PrimaryNav";
import { PlantHelper } from "./verdant/PlantHelper";
import { FooterStrip } from "./verdant/FooterStrip";
import { SignOutButton } from "./SignOutButton";

export async function Shell({
  children,
  showHelper = true,
  showFooter = true,
}: {
  children: React.ReactNode;
  showHelper?: boolean;
  showFooter?: boolean;
}) {
  const session = await auth();
  const user = session?.user
    ? { name: session.user.name, email: session.user.email, image: session.user.image }
    : null;
  const signedIn = Boolean(session);
  return (
    <div className="app-frame">
      <PrimaryNav signedIn={signedIn} user={user} />
      <main>{children}</main>
      {signedIn && showFooter && <FooterStrip />}
      {signedIn && (
        <div
          style={{
            textAlign: "center",
            padding: "16px 0 32px",
            fontFamily: "var(--font-jetbrains)",
            fontSize: 11,
            color: "var(--ink-faded)",
          }}
        >
          <SignOutButton />
        </div>
      )}
      {signedIn && showHelper && <PlantHelper />}
    </div>
  );
}
