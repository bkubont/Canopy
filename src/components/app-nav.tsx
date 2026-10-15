"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/app/app/logout-button";

const LINKS = [
  { href: "/app", label: "Home", exact: true },
  { href: "/app/clients", label: "Clients" },
  { href: "/app/jobs", label: "Jobs" },
  { href: "/app/settings", label: "Settings" },
];

export function AppNav({ businessName }: { businessName: string }) {
  const pathname = usePathname();

  return (
    <header className="topbar">
      <div className="brand-block">
        <Link href="/app" className="brand">
          Canopy <span>· {businessName}</span>
        </Link>
        <nav className="app-nav" aria-label="Main">
          {LINKS.map((link) => {
            const active = link.exact
              ? pathname === link.href
              : pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={active ? "nav-link active" : "nav-link"}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <LogoutButton />
    </header>
  );
}
