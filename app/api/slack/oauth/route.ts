import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { upsertTeamMembers, upsertWorkspace } from "@/lib/database";
import { exchangeSlackOAuthCode, listWorkspaceMembers } from "@/lib/slack-client";

const OAUTH_STATE_COOKIE = "slack_oauth_state";

function buildAuthorizeUrl(state: string): string {
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.SLACK_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error("Slack OAuth is not configured. Set SLACK_CLIENT_ID and SLACK_REDIRECT_URI.");
  }

  const scopes = [
    "chat:write",
    "channels:read",
    "groups:read",
    "users:read",
    "channels:history",
    "groups:history",
  ];

  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes.join(","),
    redirect_uri: redirectUri,
    state,
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/dashboard?slack_error=${encodeURIComponent(error)}`, request.url));
  }

  if (!code) {
    const generatedState = randomBytes(16).toString("hex");
    const authorizeUrl = buildAuthorizeUrl(generatedState);

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set({
      name: OAUTH_STATE_COOKIE,
      value: generatedState,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 10,
      path: "/",
    });

    return response;
  }

  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/dashboard?slack_error=invalid_state", request.url));
  }

  try {
    const install = await exchangeSlackOAuthCode(code);
    const workspace = await upsertWorkspace({
      teamId: install.teamId,
      teamName: install.teamName,
      botToken: install.botToken,
      botUserId: install.botUserId,
      defaultChannelId: install.defaultChannelId,
    });

    const members = await listWorkspaceMembers(install.botToken);
    await upsertTeamMembers(workspace.id, members);

    const response = NextResponse.redirect(new URL("/dashboard?slack=connected", request.url));
    response.cookies.set({
      name: "workspace_id",
      value: String(workspace.id),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 90,
      path: "/",
    });
    response.cookies.delete(OAUTH_STATE_COOKIE);

    return response;
  } catch (oauthError) {
    const message = oauthError instanceof Error ? oauthError.message : "oauth_failed";
    return NextResponse.redirect(
      new URL(`/dashboard?slack_error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
