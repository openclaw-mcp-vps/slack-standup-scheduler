import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://slack-standup-scheduler.example.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Slack Standup Scheduler",
    template: "%s | Slack Standup Scheduler",
  },
  description:
    "Smart async standup scheduling across timezones. Automatically posts standup threads when your distributed team is online and follows up with reminders.",
  applicationName: "Slack Standup Scheduler",
  keywords: [
    "slack standup",
    "async standup",
    "timezone scheduling",
    "remote team productivity",
    "slack bot",
  ],
  openGraph: {
    title: "Slack Standup Scheduler",
    description:
      "Automatically schedule standups when most team members are online and keep async updates on track.",
    url: siteUrl,
    siteName: "Slack Standup Scheduler",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Slack Standup Scheduler",
    description:
      "Smart async standup scheduling across timezones with automated reminders and threaded Slack updates.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetBrainsMono.variable} dark h-full`}>
      <body className="min-h-full bg-[#0d1117] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
