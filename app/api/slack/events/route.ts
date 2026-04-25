import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { findStandupRunByThread, getWorkspaceByTeamId, upsertStandupResponse } from "@/lib/database";

export const runtime = "nodejs";

function verifySlackSignature(request: NextRequest, rawBody: string): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return false;
  }

  const timestamp = request.headers.get("x-slack-request-timestamp");
  const slackSignature = request.headers.get("x-slack-signature");

  if (!timestamp || !slackSignature) {
    return false;
  }

  const timestampInt = Number(timestamp);
  if (Number.isNaN(timestampInt)) {
    return false;
  }

  // Slack recommends rejecting requests older than 5 minutes to prevent replay.
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampInt);
  if (ageSeconds > 60 * 5) {
    return false;
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const expectedSignature = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const actualBuffer = Buffer.from(slackSignature, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifySlackSignature(request, rawBody)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as {
    type: string;
    challenge?: string;
    team_id?: string;
    event?: {
      type?: string;
      thread_ts?: string;
      ts?: string;
      text?: string;
      user?: string;
      bot_id?: string;
      subtype?: string;
    };
  };

  if (payload.type === "url_verification" && payload.challenge) {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type !== "event_callback" || !payload.team_id || !payload.event) {
    return NextResponse.json({ ok: true });
  }

  const event = payload.event;

  if (
    event.type === "message" &&
    event.thread_ts &&
    event.ts &&
    event.text &&
    event.user &&
    !event.bot_id &&
    !event.subtype
  ) {
    const workspace = await getWorkspaceByTeamId(payload.team_id);
    if (workspace) {
      const run = await findStandupRunByThread(workspace.id, event.thread_ts);
      if (run) {
        await upsertStandupResponse({
          runId: run.id,
          slackUserId: event.user,
          messageTs: event.ts,
          responseText: event.text,
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
