import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";

import { PaywallUnlockForm } from "@/components/paywall-unlock-form";
import { StandupScheduler } from "@/components/standup-scheduler";
import { TimezoneAnalyzer } from "@/components/timezone-analyzer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getMostRecentWorkspace,
  getRecentRunsByWorkspace,
  getSchedulesByWorkspace,
  getWorkspaceById,
  getWorkspaceMembers,
} from "@/lib/database";
import { getAccessCookieName, verifyAccessCookieValue } from "@/lib/paywall";
import { listWritableChannels } from "@/lib/slack-client";
import { analyzeTimezoneOverlap } from "@/lib/timezone-optimizer";

export const metadata: Metadata = {
  title: "Dashboard | Slack Standup Scheduler",
  description: "Configure standup timing, reminders, and async response tracking for your Slack team.",
  robots: {
    index: false,
    follow: false,
  },
};

function parseWorkspaceId(cookieValue: string | undefined): number | null {
  if (!cookieValue) {
    return null;
  }

  const parsed = Number(cookieValue);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const accessCookie = cookieStore.get(getAccessCookieName())?.value;
  const access = verifyAccessCookieValue(accessCookie);

  const paymentLink = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK ?? "";

  if (!access.valid) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16 sm:px-6 lg:px-8">
        <Card className="border-slate-800 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="text-2xl text-slate-100">Unlock Standup Automation</CardTitle>
            <CardDescription className="text-slate-400">
              This is a paid tool. Purchase once, then verify the same checkout email to unlock the dashboard
              in this browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-sm leading-6 text-slate-300">
                What you get: timezone overlap analysis, automated standup thread posting, and reminder nudges
                to teammates who have not replied yet.
              </p>
            </div>

            <Button asChild className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400">
              <a href={paymentLink} target="_blank" rel="noreferrer">
                Buy Access - $15/mo
              </a>
            </Button>

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-200">Already paid?</p>
              <PaywallUnlockForm />
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  const workspaceId = parseWorkspaceId(cookieStore.get("workspace_id")?.value);
  const workspace = workspaceId ? await getWorkspaceById(workspaceId) : await getMostRecentWorkspace();

  if (!workspace) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16 sm:px-6 lg:px-8">
        <Card className="border-slate-800 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="text-2xl text-slate-100">Connect Slack to get started</CardTitle>
            <CardDescription className="text-slate-400">
              We need workspace timezone metadata before we can calculate optimal standup windows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="bg-cyan-500 text-slate-950 hover:bg-cyan-400">
              <Link href="/api/slack/oauth">Connect Slack Workspace</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const [members, schedules, recentRuns, channels] = await Promise.all([
    getWorkspaceMembers(workspace.id),
    getSchedulesByWorkspace(workspace.id),
    getRecentRunsByWorkspace(workspace.id),
    listWritableChannels(workspace.botToken).catch(() => []),
  ]);

  const activeMembers = members.filter((member) => !member.isDeleted);

  const recommendations = analyzeTimezoneOverlap(
    activeMembers.map((member) => ({
      slackUserId: member.slackUserId,
      displayName: member.displayName,
      timezone: member.timezone,
      utcOffsetMinutes: member.utcOffsetMinutes,
    }))
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-100">{workspace.teamName} Dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Smart async standup scheduling across timezones. Team data syncs from Slack and powers automated
              posting + response reminders.
            </p>
          </div>
          <Button asChild variant="outline" className="border-slate-700 text-slate-200 hover:bg-slate-900">
            <Link href="/api/slack/oauth">Reconnect Slack</Link>
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Badge className="border-cyan-700 bg-cyan-500/20 text-cyan-200">{activeMembers.length} active members</Badge>
          <Badge className="border-slate-700 bg-slate-900 text-slate-200">{schedules.length} schedules</Badge>
          <Badge className="border-slate-700 bg-slate-900 text-slate-200">{recentRuns.length} recent runs tracked</Badge>
        </div>
      </section>

      <TimezoneAnalyzer totalMembers={activeMembers.length} recommendations={recommendations} />

      <StandupScheduler
        workspaceId={workspace.id}
        channels={channels}
        schedules={schedules}
        defaultQuestion={workspace.standupQuestion}
      />

      <Card className="border-slate-800 bg-slate-950/60">
        <CardHeader>
          <CardTitle className="text-slate-100">Recent Standup Threads</CardTitle>
          <CardDescription className="text-slate-400">
            Response tracking comes from Slack thread replies captured via the events endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentRuns.length === 0 ? (
            <p className="text-sm text-slate-400">No runs yet. Save a schedule and trigger the cron endpoint.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead>Standup Date</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Responses</TableHead>
                  <TableHead>Thread TS</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRuns.map((run) => (
                  <TableRow key={run.id} className="border-slate-900">
                    <TableCell>{run.standupDate}</TableCell>
                    <TableCell>{run.channelId}</TableCell>
                    <TableCell>{run.responseCount}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-400">{run.threadTs}</TableCell>
                    <TableCell>{new Date(run.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
