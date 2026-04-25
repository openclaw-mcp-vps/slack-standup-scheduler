import { WebClient } from "@slack/web-api";

export interface SlackOAuthInstall {
  teamId: string;
  teamName: string;
  botToken: string;
  botUserId: string | null;
  defaultChannelId: string | null;
}

export interface SlackMember {
  slackUserId: string;
  displayName: string;
  timezone: string;
  utcOffsetMinutes: number;
  isDeleted: boolean;
}

export interface SlackChannel {
  id: string;
  name: string;
}

function createAnonymousClient(): WebClient {
  return new WebClient(undefined, {
    retryConfig: {
      retries: 2,
    },
  });
}

export function createSlackClient(botToken: string): WebClient {
  return new WebClient(botToken, {
    retryConfig: {
      retries: 2,
    },
  });
}

export async function exchangeSlackOAuthCode(code: string): Promise<SlackOAuthInstall> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = process.env.SLACK_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Slack OAuth environment variables are missing.");
  }

  const oauthClient = createAnonymousClient();
  const result = await oauthClient.oauth.v2.access({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  if (!result.ok || !result.access_token || !result.team?.id || !result.team?.name) {
    throw new Error(`Slack OAuth failed: ${result.error ?? "unknown_error"}`);
  }

  return {
    teamId: result.team.id,
    teamName: result.team.name,
    botToken: result.access_token,
    botUserId: result.bot_user_id ?? null,
    defaultChannelId: null,
  };
}

export async function listWorkspaceMembers(botToken: string): Promise<SlackMember[]> {
  const client = createSlackClient(botToken);

  let cursor: string | undefined;
  const members: SlackMember[] = [];

  do {
    const page = await client.users.list({
      limit: 200,
      cursor,
    });

    if (!page.ok || !page.members) {
      throw new Error(`Unable to list Slack members: ${page.error ?? "unknown_error"}`);
    }

    for (const member of page.members) {
      if (!member || !member.id || member.is_bot || member.deleted) {
        continue;
      }

      const profile = member.profile ?? {};
      const displayName =
        profile.display_name?.trim() ||
        profile.real_name?.trim() ||
        member.real_name?.trim() ||
        member.name ||
        member.id;

      members.push({
        slackUserId: member.id,
        displayName,
        timezone: member.tz || "UTC",
        utcOffsetMinutes: Math.round((member.tz_offset ?? 0) / 60),
        isDeleted: Boolean(member.deleted),
      });
    }

    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return members;
}

export async function listWritableChannels(botToken: string): Promise<SlackChannel[]> {
  const client = createSlackClient(botToken);
  let cursor: string | undefined;
  const channels: SlackChannel[] = [];

  do {
    const page = await client.conversations.list({
      types: "public_channel,private_channel",
      limit: 200,
      cursor,
    });

    if (!page.ok || !page.channels) {
      throw new Error(`Unable to list channels: ${page.error ?? "unknown_error"}`);
    }

    for (const channel of page.channels) {
      if (!channel?.id || !channel?.name || channel.is_archived) {
        continue;
      }

      channels.push({
        id: channel.id,
        name: channel.name,
      });
    }

    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return channels.sort((a, b) => a.name.localeCompare(b.name));
}

export async function postStandupPrompt(input: {
  botToken: string;
  channelId: string;
  question: string;
  standupDate: string;
}): Promise<{ ts: string; threadTs: string }> {
  const client = createSlackClient(input.botToken);
  const message = await client.chat.postMessage({
    channel: input.channelId,
    text: `Async standup for ${input.standupDate}: ${input.question}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Async Standup · ${input.standupDate}`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: input.question,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Reply in this thread before your local end-of-day. Updates are collected automatically.",
          },
        ],
      },
    ],
  });

  if (!message.ok || !message.ts) {
    throw new Error(`Unable to post standup prompt: ${message.error ?? "unknown_error"}`);
  }

  return {
    ts: message.ts,
    threadTs: message.ts,
  };
}

export async function postThreadReminder(input: {
  botToken: string;
  channelId: string;
  threadTs: string;
  pendingUserIds: string[];
}): Promise<void> {
  if (input.pendingUserIds.length === 0) {
    return;
  }

  const client = createSlackClient(input.botToken);
  const mentions = input.pendingUserIds.slice(0, 12).map((id) => `<@${id}>`).join(" ");

  const response = await client.chat.postMessage({
    channel: input.channelId,
    thread_ts: input.threadTs,
    text: `${mentions} quick reminder to drop your standup update in this thread.`,
  });

  if (!response.ok) {
    throw new Error(`Unable to send reminder: ${response.error ?? "unknown_error"}`);
  }
}
