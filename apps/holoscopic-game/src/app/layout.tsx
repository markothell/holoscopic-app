import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Cormorant_Garamond, DM_Mono, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { InstanceProvider } from "@/contexts/InstanceContext";
import ServiceWorkerRegistration from "@/components/pwa/ServiceWorkerRegistration";
import InstanceEndedBanner from "@/components/InstanceEndedBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  style: ["normal", "italic"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Holoscopic",
  description: "Building open source social systems through collaborative mapping",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Holoscopic",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: false,
  themeColor: "#F7F4EF",
};

declare global {
  interface Window {
    __hsReveal?: () => void;
  }
}

// Scroll-reveal for `[data-reveal]` sections (the homepage's editorial blocks).
//
// This is deliberately a plain inline script rather than a React effect. Those
// sections ship at opacity 0 and only the observer makes them visible, so
// hanging that on hydration meant the page ended at the hero until the entire
// bundle had downloaded and hydrated. Inline, it runs while the HTML is still
// parsing — no bundle, no React, no waiting.
//
// Already-armed elements are tracked in a WeakSet rather than a marker
// attribute. That is not a style choice: this runs BEFORE hydration, and any
// attribute it writes is one React's render did not produce, which React
// reports as a hydration mismatch. Keeping the bookkeeping off the DOM leaves
// the server HTML untouched. Re-running stays a no-op, which is what lets a
// client-side navigation call `window.__hsReveal()` safely.
//
// Reduced motion is handled entirely in page.module.css, so there is no
// motion branch here.
const revealScript = `(function(){
  var armed = typeof WeakSet === 'function' ? new WeakSet() : null;
  function arm(){
    var els = document.querySelectorAll('[data-reveal]');
    var pending = [];
    for (var i = 0; i < els.length; i++) {
      if (armed && armed.has(els[i])) continue;
      if (els[i].hasAttribute('data-revealed')) continue;
      if (armed) armed.add(els[i]);
      pending.push(els[i]);
    }
    if (!pending.length) return;
    if (!('IntersectionObserver' in window)) {
      for (var j = 0; j < pending.length; j++) {
        pending[j].setAttribute('data-revealed','');
      }
      return;
    }
    var io = new IntersectionObserver(function(entries){
      for (var k = 0; k < entries.length; k++) {
        if (entries[k].isIntersecting) {
          entries[k].target.setAttribute('data-revealed','');
          io.unobserve(entries[k].target);
        }
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -50px 0px' });
    for (var m = 0; m < pending.length; m++) {
      io.observe(pending[m]);
    }
  }
  window.__hsReveal = arm;
  arm();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm);
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} ${dmMono.variable} ${barlowCondensed.variable} antialiased`}
      >
        <SessionProvider>
          <InstanceProvider>
            <AuthProvider>
              <InstanceEndedBanner />
              {children}
              <ServiceWorkerRegistration />
            </AuthProvider>
          </InstanceProvider>
        </SessionProvider>
        {/* Last in the body so the sections it looks for are already parsed. */}
        <script dangerouslySetInnerHTML={{ __html: revealScript }} />
      </body>
    </html>
  );
}
