"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  const logout = async (): Promise<void> => {
    await fetch("/api/admin/auth/logout", {
      method: "POST"
    });

    router.push("/admin/login");
    router.refresh();
  };

  return (
    <button type="button" onClick={() => void logout()}>
      Log out
    </button>
  );
}
