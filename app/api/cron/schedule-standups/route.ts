import { NextRequest, NextResponse } from "next/server";

import {
  getDueSchedules,
  getRunResponseUserIds,
  getRunsNeedingReminder,
  getWorkspaceMembers,
  markRunReminderSent,
  updateScheduleNextRun,
  upsertStandupRun,
} from "@/lib/database";
import { postStandupPrompt, postThreadReminder } from "@/lib/slack-client";
import { computeNextRunAt, formatStandupDate } from "@/lib/timezone-optimizer";

export const runtime = "nodejs";

function normalizeLocalTime(localTime: string): string {
  return localTime.slice(0, 5);
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const dueSchedules = await getDueSchedules(now);

  let promptsCreated = 0;
  let remindersSent = 0;
  const errors: string[] = [];

  for (const schedule of dueSchedules) {
    try {
      const standupDate = formatStandupDate(now, schedule.timezone);
      const posted = await postStandupPrompt({
        botToken: schedule.botToken,
        channelId: schedule.channelId,
        question: schedule.question,
        standupDate,
      });

      await upsertStandupRun({
        scheduleId: schedule.id,
        workspaceId: schedule.workspaceId,
        channelId: schedule.channelId,
        standupDate,
        postedTs: posted.ts,
        threadTs: posted.threadTs,
      });

      const nextRunAt = computeNextRunAt(
        schedule.timezone,
        normalizeLocalTime(schedule.standupTimeLocal),
        schedule.daysOfWeek,
        new Date(now.getTime() + 60 * 1000)
      );
      await updateScheduleNextRun(schedule.id, nextRunAt);

      promptsCreated += 1;
    } catch (error) {
      errors.push(
        `schedule:${schedule.id} ${error instanceof Error ? error.message : "unknown_error"}`
      );
    }
  }

  const reminderTargets = await getRunsNeedingReminder(now);
  for (const target of reminderTargets) {
    try {
      const members = await getWorkspaceMembers(target.run.workspaceId);
      const expectedIds = members.filter((member) => !member.isDeleted).map((member) => member.slackUserId);
      const respondedIds = new Set(await getRunResponseUserIds(target.run.id));
      const pendingUserIds = expectedIds.filter((id) => !respondedIds.has(id));

      if (pendingUserIds.length > 0) {
        await postThreadReminder({
          botToken: target.botToken,
          channelId: target.run.channelId,
          threadTs: target.run.threadTs,
          pendingUserIds,
        });
        remindersSent += 1;
      }

      await markRunReminderSent(target.run.id);
    } catch (error) {
      errors.push(`reminder:${target.run.id} ${error instanceof Error ? error.message : "unknown_error"}`);
    }
  }

  return NextResponse.json({
    ok: true,
    dueSchedules: dueSchedules.length,
    promptsCreated,
    remindersSent,
    errors,
    evaluatedAt: now.toISOString(),
  });
}
