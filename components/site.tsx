"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, Check, Menu, X } from "lucide-react";
import { useApp } from "./provider";

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="Fairstage home">
      <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
        <path d="M4 4h24v7H12v6h12v7H12v8H4z" fill="currentColor" />
        <circle cx="27" cy="28" r="4" fill="currentColor" />
      </svg>
      <span>fairstage</span>
    </Link>
  );
}
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="container nav">
        <Logo />
        <button
          className="icon-button mobile-menu"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
        >
          {open ? <X /> : <Menu />}
        </button>
        <nav
          className={open ? "site-nav open" : "site-nav"}
          aria-label="Main navigation"
        >
          <Link href="/how-it-works" onClick={() => setOpen(false)}>
            How it works
          </Link>
          <Link href="/pricing" onClick={() => setOpen(false)}>
            Pricing
          </Link>
          <Link href="/jobs" onClick={() => setOpen(false)}>
            Explore jobs
          </Link>
          <Link href="/open" onClick={() => setOpen(false)}>
            Open model <ArrowUpRight size={14} />
          </Link>
          <Link href="/account" className="button small secondary">
            Sign in
          </Link>
          <Link href="/workspace" className="button small">
            Try the demo <ArrowRight size={16} />
          </Link>
        </nav>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <Logo />
          <p>Good interviews start with respect for time.</p>
          <span className="muted small-text">
            An open-source product by Nikhilvarma Kandula.
          </span>
        </div>
        <div className="footer-links">
          <Link href="/pricing">Pilot pricing</Link>
          <Link href="/policy">Candidate pay policy</Link>
          <Link href="/privacy">Privacy</Link>
          <a href="https://github.com/kandulanikhilvarma/fairstage">
            Source code <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
      <div className="container footer-note">
        <span>© 2026 Fairstage. MIT-licensed code.</span>
        <span>Demo data. No real payments.</span>
      </div>
    </footer>
  );
}
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
export function DemoNotice() {
  const { config } = useApp();
  return config.demo ? (
    <div className="demo-notice">
      <span className="status-dot" /> Interactive demo · Fictional data. No
      money moves.
    </div>
  ) : null;
}
export function Tick({ children }: { children: React.ReactNode }) {
  return (
    <span className="tick">
      <Check size={18} />
      {children}
    </span>
  );
}
