import { NextRequest, NextResponse } from "next/server";

import {
  getMostRecentWorkspace,
  getSchedulesByWorkspace,
  getWorkspaceById,
  getWorkspaceMembers,
  upsertSchedule,
} from "@/lib/database";
import { listWritableChannels } from "@/lib/slack-client";
import { computeNextRunAt, normalizeDaysOfWeek } from "@/lib/timezone-optimizer";

function parseWorkspaceId(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

async function resolveWorkspace(workspaceId: number | null) {
  if (workspaceId) {
    const workspace = await getWorkspaceById(workspaceId);
    if (workspace) {
      return workspace;
    }
  }

  return getMostRecentWorkspace();
}

export async function GET(request: NextRequest) {
  const workspaceId = parseWorkspaceId(
    request.nextUrl.searchParams.get("workspaceId") ?? request.cookies.get("workspace_id")?.value
  );
  const workspace = await resolveWorkspace(workspaceId);

  if (!workspace) {
    return NextResponse.json({
      ok: true,
      workspace: null,
      members: [],
      schedules: [],
      channels: [],
    });
  }

  const [members, schedules, channels] = await Promise.all([
    getWorkspaceMembers(workspace.id),
    getSchedulesByWorkspace(workspace.id),
    listWritableChannels(workspace.botToken).catch(() => []),
  ]);

  return NextResponse.json({
    ok: true,
    workspace,
    members,
    schedules,
    channels,
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    workspaceId?: number;
    channelId?: string;
    timezone?: string;
    standupTimeLocal?: string;
    daysOfWeek?: number[];
    reminderDelayMinutes?: number;
    question?: string;
  } | null;

  const workspaceId = body?.workspaceId ?? parseWorkspaceId(request.cookies.get("workspace_id")?.value);
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "Connect a Slack workspace first." }, { status: 400 });
  }

  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) {
    return NextResponse.json({ ok: false, error: "Workspace not found." }, { status: 404 });
  }

  const channelId = body?.channelId?.trim();
  const timezone = body?.timezone?.trim();
  const standupTimeLocal = body?.standupTimeLocal?.trim();
  const question = body?.question?.trim();

  if (!channelId || !timezone || !standupTimeLocal || !question) {
    return NextResponse.json(
      { ok: false, error: "Channel, timezone, local time, and standup question are required." },
      { status: 400 }
    );
  }

  if (!/^\d{2}:\d{2}$/.test(standupTimeLocal)) {
    return NextResponse.json(
      { ok: false, error: "standupTimeLocal must be in HH:mm format." },
      { status: 400 }
    );
  }

  const daysOfWeek = normalizeDaysOfWeek(body?.daysOfWeek);
  const reminderDelayMinutes = Math.max(30, Math.min(body?.reminderDelayMinutes ?? 120, 720));

  const nextRunAt = computeNextRunAt(timezone, standupTimeLocal, daysOfWeek, new Date());

  const schedule = await upsertSchedule({
    workspaceId,
    channelId,
    timezone,
    standupTimeLocal,
    daysOfWeek,
    reminderDelayMinutes,
    question,
    nextRunAt,
  });

  return NextResponse.json({ ok: true, schedule });
}
