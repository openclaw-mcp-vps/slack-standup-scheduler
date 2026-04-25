import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

export interface WorkspaceRecord {
  id: number;
  teamId: string;
  teamName: string;
  botToken: string;
  botUserId: string | null;
  defaultChannelId: string | null;
  standupQuestion: string;
}

export interface MemberRecord {
  slackUserId: string;
  displayName: string;
  timezone: string;
  utcOffsetMinutes: number;
  isDeleted: boolean;
}

export interface ScheduleRecord {
  id: number;
  workspaceId: number;
  channelId: string;
  timezone: string;
  standupTimeLocal: string;
  daysOfWeek: number[];
  reminderDelayMinutes: number;
  question: string;
  isActive: boolean;
  nextRunAt: string;
}

export interface DueScheduleRecord extends ScheduleRecord {
  teamId: string;
  teamName: string;
  botToken: string;
}

export interface StandupRunRecord {
  id: number;
  scheduleId: number;
  workspaceId: number;
  channelId: string;
  standupDate: string;
  postedTs: string;
  threadTs: string;
  reminderSentAt: string | null;
  createdAt: string;
}

export interface PurchaseRecord {
  email: string;
  sessionId: string;
  customerId: string | null;
  amountTotal: number | null;
  currency: string | null;
  status: string;
  metadata: Record<string, unknown>;
}

declare global {
  // eslint-disable-next-line no-var
  var __standupSchedulerPool: Pool | undefined;
}

function getPool(): Pool {
  if (global.__standupSchedulerPool) {
    return global.__standupSchedulerPool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const pool = new Pool({
    connectionString,
    max: 10,
    ssl:
      process.env.NODE_ENV === "production"
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
  });

  global.__standupSchedulerPool = pool;
  return pool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

let schemaReady = false;

export async function ensureDatabase(): Promise<void> {
  if (schemaReady) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id SERIAL PRIMARY KEY,
      team_id TEXT NOT NULL UNIQUE,
      team_name TEXT NOT NULL,
      bot_token TEXT NOT NULL,
      bot_user_id TEXT,
      default_channel_id TEXT,
      standup_question TEXT NOT NULL DEFAULT 'What did you ship yesterday? What is your priority today? Any blockers?',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      slack_user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      timezone TEXT NOT NULL,
      utc_offset_minutes INTEGER NOT NULL DEFAULT 0,
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(workspace_id, slack_user_id)
    );

    CREATE TABLE IF NOT EXISTS standup_schedules (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL,
      timezone TEXT NOT NULL,
      standup_time_local TIME NOT NULL,
      days_of_week INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
      reminder_delay_minutes INTEGER NOT NULL DEFAULT 120,
      question TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      next_run_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(workspace_id, channel_id)
    );

    CREATE TABLE IF NOT EXISTS standup_runs (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER NOT NULL REFERENCES standup_schedules(id) ON DELETE CASCADE,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL,
      standup_date DATE NOT NULL,
      posted_ts TEXT NOT NULL,
      thread_ts TEXT NOT NULL,
      reminder_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(schedule_id, standup_date)
    );

    CREATE TABLE IF NOT EXISTS standup_responses (
      id SERIAL PRIMARY KEY,
      run_id INTEGER NOT NULL REFERENCES standup_runs(id) ON DELETE CASCADE,
      slack_user_id TEXT NOT NULL,
      message_ts TEXT NOT NULL,
      response_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(run_id, slack_user_id)
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      stripe_session_id TEXT NOT NULL UNIQUE,
      stripe_customer_id TEXT,
      amount_total INTEGER,
      currency TEXT,
      status TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_team_members_workspace ON team_members(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON standup_schedules(next_run_at);
    CREATE INDEX IF NOT EXISTS idx_runs_workspace_thread ON standup_runs(workspace_id, thread_ts);
    CREATE INDEX IF NOT EXISTS idx_purchases_email_status ON purchases(email, status);
  `);

  schemaReady = true;
}

function mapWorkspace(row: {
  id: number;
  team_id: string;
  team_name: string;
  bot_token: string;
  bot_user_id: string | null;
  default_channel_id: string | null;
  standup_question: string;
}): WorkspaceRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    teamName: row.team_name,
    botToken: row.bot_token,
    botUserId: row.bot_user_id,
    defaultChannelId: row.default_channel_id,
    standupQuestion: row.standup_question,
  };
}

function mapSchedule(row: {
  id: number;
  workspace_id: number;
  channel_id: string;
  timezone: string;
  standup_time_local: string;
  days_of_week: number[];
  reminder_delay_minutes: number;
  question: string;
  is_active: boolean;
  next_run_at: string;
}): ScheduleRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    timezone: row.timezone,
    standupTimeLocal: row.standup_time_local,
    daysOfWeek: row.days_of_week,
    reminderDelayMinutes: row.reminder_delay_minutes,
    question: row.question,
    isActive: row.is_active,
    nextRunAt: row.next_run_at,
  };
}

export async function upsertWorkspace(input: {
  teamId: string;
  teamName: string;
  botToken: string;
  botUserId: string | null;
  defaultChannelId: string | null;
  standupQuestion?: string;
}): Promise<WorkspaceRecord> {
  await ensureDatabase();

  const result = await query<{
    id: number;
    team_id: string;
    team_name: string;
    bot_token: string;
    bot_user_id: string | null;
    default_channel_id: string | null;
    standup_question: string;
  }>(
    `
      INSERT INTO workspaces (
        team_id,
        team_name,
        bot_token,
        bot_user_id,
        default_channel_id,
        standup_question,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        COALESCE(
          $6,
          'What did you ship yesterday? What is your priority today? Any blockers?'
        ),
        NOW()
      )
      ON CONFLICT (team_id)
      DO UPDATE SET
        team_name = EXCLUDED.team_name,
        bot_token = EXCLUDED.bot_token,
        bot_user_id = EXCLUDED.bot_user_id,
        default_channel_id = EXCLUDED.default_channel_id,
        standup_question = COALESCE(EXCLUDED.standup_question, workspaces.standup_question),
        updated_at = NOW()
      RETURNING id, team_id, team_name, bot_token, bot_user_id, default_channel_id, standup_question
    `,
    [
      input.teamId,
      input.teamName,
      input.botToken,
      input.botUserId,
      input.defaultChannelId,
      input.standupQuestion ?? null,
    ]
  );

  return mapWorkspace(result.rows[0]);
}

export async function upsertTeamMembers(
  workspaceId: number,
  members: Array<{
    slackUserId: string;
    displayName: string;
    timezone: string;
    utcOffsetMinutes: number;
    isDeleted?: boolean;
  }>
): Promise<void> {
  await ensureDatabase();

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE team_members SET is_deleted = TRUE, updated_at = NOW() WHERE workspace_id = $1`,
      [workspaceId]
    );

    for (const member of members) {
      await client.query(
        `
          INSERT INTO team_members (
            workspace_id,
            slack_user_id,
            display_name,
            timezone,
            utc_offset_minutes,
            is_deleted,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (workspace_id, slack_user_id)
          DO UPDATE SET
            display_name = EXCLUDED.display_name,
            timezone = EXCLUDED.timezone,
            utc_offset_minutes = EXCLUDED.utc_offset_minutes,
            is_deleted = EXCLUDED.is_deleted,
            updated_at = NOW()
        `,
        [
          workspaceId,
          member.slackUserId,
          member.displayName,
          member.timezone,
          member.utcOffsetMinutes,
          member.isDeleted ?? false,
        ]
      );
    }
  });
}

export async function getWorkspaceById(workspaceId: number): Promise<WorkspaceRecord | null> {
  await ensureDatabase();
  const result = await query<{
    id: number;
    team_id: string;
    team_name: string;
    bot_token: string;
    bot_user_id: string | null;
    default_channel_id: string | null;
    standup_question: string;
  }>(
    `
      SELECT id, team_id, team_name, bot_token, bot_user_id, default_channel_id, standup_question
      FROM workspaces
      WHERE id = $1
    `,
    [workspaceId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapWorkspace(result.rows[0]);
}

export async function getWorkspaceByTeamId(teamId: string): Promise<WorkspaceRecord | null> {
  await ensureDatabase();
  const result = await query<{
    id: number;
    team_id: string;
    team_name: string;
    bot_token: string;
    bot_user_id: string | null;
    default_channel_id: string | null;
    standup_question: string;
  }>(
    `
      SELECT id, team_id, team_name, bot_token, bot_user_id, default_channel_id, standup_question
      FROM workspaces
      WHERE team_id = $1
    `,
    [teamId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapWorkspace(result.rows[0]);
}

export async function getMostRecentWorkspace(): Promise<WorkspaceRecord | null> {
  await ensureDatabase();
  const result = await query<{
    id: number;
    team_id: string;
    team_name: string;
    bot_token: string;
    bot_user_id: string | null;
    default_channel_id: string | null;
    standup_question: string;
  }>(
    `
      SELECT id, team_id, team_name, bot_token, bot_user_id, default_channel_id, standup_question
      FROM workspaces
      ORDER BY updated_at DESC
      LIMIT 1
    `
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapWorkspace(result.rows[0]);
}

export async function getWorkspaceMembers(workspaceId: number): Promise<MemberRecord[]> {
  await ensureDatabase();
  const result = await query<{
    slack_user_id: string;
    display_name: string;
    timezone: string;
    utc_offset_minutes: number;
    is_deleted: boolean;
  }>(
    `
      SELECT slack_user_id, display_name, timezone, utc_offset_minutes, is_deleted
      FROM team_members
      WHERE workspace_id = $1
      ORDER BY display_name ASC
    `,
    [workspaceId]
  );

  return result.rows.map((row) => ({
    slackUserId: row.slack_user_id,
    displayName: row.display_name,
    timezone: row.timezone,
    utcOffsetMinutes: row.utc_offset_minutes,
    isDeleted: row.is_deleted,
  }));
}

export async function upsertSchedule(input: {
  workspaceId: number;
  channelId: string;
  timezone: string;
  standupTimeLocal: string;
  daysOfWeek: number[];
  reminderDelayMinutes: number;
  question: string;
  nextRunAt: Date;
}): Promise<ScheduleRecord> {
  await ensureDatabase();

  const result = await query<{
    id: number;
    workspace_id: number;
    channel_id: string;
    timezone: string;
    standup_time_local: string;
    days_of_week: number[];
    reminder_delay_minutes: number;
    question: string;
    is_active: boolean;
    next_run_at: string;
  }>(
    `
      INSERT INTO standup_schedules (
        workspace_id,
        channel_id,
        timezone,
        standup_time_local,
        days_of_week,
        reminder_delay_minutes,
        question,
        next_run_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4::time, $5::int[], $6, $7, $8, NOW())
      ON CONFLICT (workspace_id, channel_id)
      DO UPDATE SET
        timezone = EXCLUDED.timezone,
        standup_time_local = EXCLUDED.standup_time_local,
        days_of_week = EXCLUDED.days_of_week,
        reminder_delay_minutes = EXCLUDED.reminder_delay_minutes,
        question = EXCLUDED.question,
        next_run_at = EXCLUDED.next_run_at,
        is_active = TRUE,
        updated_at = NOW()
      RETURNING id, workspace_id, channel_id, timezone, standup_time_local, days_of_week, reminder_delay_minutes, question, is_active, next_run_at
    `,
    [
      input.workspaceId,
      input.channelId,
      input.timezone,
      input.standupTimeLocal,
      input.daysOfWeek,
      input.reminderDelayMinutes,
      input.question,
      input.nextRunAt.toISOString(),
    ]
  );

  return mapSchedule(result.rows[0]);
}

export async function getSchedulesByWorkspace(workspaceId: number): Promise<ScheduleRecord[]> {
  await ensureDatabase();
  const result = await query<{
    id: number;
    workspace_id: number;
    channel_id: string;
    timezone: string;
    standup_time_local: string;
    days_of_week: number[];
    reminder_delay_minutes: number;
    question: string;
    is_active: boolean;
    next_run_at: string;
  }>(
    `
      SELECT id, workspace_id, channel_id, timezone, standup_time_local, days_of_week,
             reminder_delay_minutes, question, is_active, next_run_at
      FROM standup_schedules
      WHERE workspace_id = $1
      ORDER BY channel_id ASC
    `,
    [workspaceId]
  );

  return result.rows.map(mapSchedule);
}

export async function getDueSchedules(now: Date): Promise<DueScheduleRecord[]> {
  await ensureDatabase();

  const result = await query<{
    id: number;
    workspace_id: number;
    channel_id: string;
    timezone: string;
    standup_time_local: string;
    days_of_week: number[];
    reminder_delay_minutes: number;
    question: string;
    is_active: boolean;
    next_run_at: string;
    team_id: string;
    team_name: string;
    bot_token: string;
  }>(
    `
      SELECT
        s.id,
        s.workspace_id,
        s.channel_id,
        s.timezone,
        s.standup_time_local,
        s.days_of_week,
        s.reminder_delay_minutes,
        s.question,
        s.is_active,
        s.next_run_at,
        w.team_id,
        w.team_name,
        w.bot_token
      FROM standup_schedules s
      JOIN workspaces w ON w.id = s.workspace_id
      WHERE s.is_active = TRUE
        AND s.next_run_at <= $1
      ORDER BY s.next_run_at ASC
    `,
    [now.toISOString()]
  );

  return result.rows.map((row) => ({
    ...mapSchedule(row),
    teamId: row.team_id,
    teamName: row.team_name,
    botToken: row.bot_token,
  }));
}

export async function updateScheduleNextRun(scheduleId: number, nextRunAt: Date): Promise<void> {
  await ensureDatabase();
  await query(
    `
      UPDATE standup_schedules
      SET next_run_at = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [scheduleId, nextRunAt.toISOString()]
  );
}

export async function upsertStandupRun(input: {
  scheduleId: number;
  workspaceId: number;
  channelId: string;
  standupDate: string;
  postedTs: string;
  threadTs: string;
}): Promise<StandupRunRecord> {
  await ensureDatabase();

  const result = await query<{
    id: number;
    schedule_id: number;
    workspace_id: number;
    channel_id: string;
    standup_date: string;
    posted_ts: string;
    thread_ts: string;
    reminder_sent_at: string | null;
    created_at: string;
  }>(
    `
      INSERT INTO standup_runs (
        schedule_id,
        workspace_id,
        channel_id,
        standup_date,
        posted_ts,
        thread_ts
      )
      VALUES ($1, $2, $3, $4::date, $5, $6)
      ON CONFLICT (schedule_id, standup_date)
      DO UPDATE SET
        posted_ts = EXCLUDED.posted_ts,
        thread_ts = EXCLUDED.thread_ts
      RETURNING id, schedule_id, workspace_id, channel_id, standup_date, posted_ts, thread_ts, reminder_sent_at, created_at
    `,
    [
      input.scheduleId,
      input.workspaceId,
      input.channelId,
      input.standupDate,
      input.postedTs,
      input.threadTs,
    ]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    standupDate: row.standup_date,
    postedTs: row.posted_ts,
    threadTs: row.thread_ts,
    reminderSentAt: row.reminder_sent_at,
    createdAt: row.created_at,
  };
}

export async function findStandupRunByThread(
  workspaceId: number,
  threadTs: string
): Promise<StandupRunRecord | null> {
  await ensureDatabase();

  const result = await query<{
    id: number;
    schedule_id: number;
    workspace_id: number;
    channel_id: string;
    standup_date: string;
    posted_ts: string;
    thread_ts: string;
    reminder_sent_at: string | null;
    created_at: string;
  }>(
    `
      SELECT id, schedule_id, workspace_id, channel_id, standup_date, posted_ts,
             thread_ts, reminder_sent_at, created_at
      FROM standup_runs
      WHERE workspace_id = $1
        AND thread_ts = $2
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [workspaceId, threadTs]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    standupDate: row.standup_date,
    postedTs: row.posted_ts,
    threadTs: row.thread_ts,
    reminderSentAt: row.reminder_sent_at,
    createdAt: row.created_at,
  };
}

export async function upsertStandupResponse(input: {
  runId: number;
  slackUserId: string;
  messageTs: string;
  responseText: string;
}): Promise<void> {
  await ensureDatabase();

  await query(
    `
      INSERT INTO standup_responses (run_id, slack_user_id, message_ts, response_text)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (run_id, slack_user_id)
      DO UPDATE SET
        message_ts = EXCLUDED.message_ts,
        response_text = EXCLUDED.response_text,
        updated_at = NOW()
    `,
    [input.runId, input.slackUserId, input.messageTs, input.responseText]
  );
}

export async function getRunResponseUserIds(runId: number): Promise<string[]> {
  await ensureDatabase();
  const result = await query<{ slack_user_id: string }>(
    `SELECT slack_user_id FROM standup_responses WHERE run_id = $1`,
    [runId]
  );

  return result.rows.map((row) => row.slack_user_id);
}

export async function getRunsNeedingReminder(now: Date): Promise<
  Array<{
    run: StandupRunRecord;
    schedule: ScheduleRecord;
    botToken: string;
  }>
> {
  await ensureDatabase();
  const result = await query<{
    run_id: number;
    schedule_id: number;
    workspace_id: number;
    channel_id: string;
    standup_date: string;
    posted_ts: string;
    thread_ts: string;
    reminder_sent_at: string | null;
    run_created_at: string;
    timezone: string;
    standup_time_local: string;
    days_of_week: number[];
    reminder_delay_minutes: number;
    question: string;
    is_active: boolean;
    next_run_at: string;
    bot_token: string;
  }>(
    `
      SELECT
        r.id AS run_id,
        r.schedule_id,
        r.workspace_id,
        r.channel_id,
        r.standup_date,
        r.posted_ts,
        r.thread_ts,
        r.reminder_sent_at,
        r.created_at AS run_created_at,
        s.timezone,
        s.standup_time_local,
        s.days_of_week,
        s.reminder_delay_minutes,
        s.question,
        s.is_active,
        s.next_run_at,
        w.bot_token
      FROM standup_runs r
      JOIN standup_schedules s ON s.id = r.schedule_id
      JOIN workspaces w ON w.id = r.workspace_id
      WHERE r.reminder_sent_at IS NULL
        AND r.created_at <= ($1::timestamptz - make_interval(mins => s.reminder_delay_minutes))
      ORDER BY r.created_at ASC
    `,
    [now.toISOString()]
  );

  return result.rows.map((row) => ({
    run: {
      id: row.run_id,
      scheduleId: row.schedule_id,
      workspaceId: row.workspace_id,
      channelId: row.channel_id,
      standupDate: row.standup_date,
      postedTs: row.posted_ts,
      threadTs: row.thread_ts,
      reminderSentAt: row.reminder_sent_at,
      createdAt: row.run_created_at,
    },
    schedule: {
      id: row.schedule_id,
      workspaceId: row.workspace_id,
      channelId: row.channel_id,
      timezone: row.timezone,
      standupTimeLocal: row.standup_time_local,
      daysOfWeek: row.days_of_week,
      reminderDelayMinutes: row.reminder_delay_minutes,
      question: row.question,
      isActive: row.is_active,
      nextRunAt: row.next_run_at,
    },
    botToken: row.bot_token,
  }));
}

export async function markRunReminderSent(runId: number): Promise<void> {
  await ensureDatabase();
  await query(`UPDATE standup_runs SET reminder_sent_at = NOW() WHERE id = $1`, [runId]);
}

export async function upsertPurchase(purchase: PurchaseRecord): Promise<void> {
  await ensureDatabase();

  await query(
    `
      INSERT INTO purchases (
        email,
        stripe_session_id,
        stripe_customer_id,
        amount_total,
        currency,
        status,
        metadata,
        purchased_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW())
      ON CONFLICT (stripe_session_id)
      DO UPDATE SET
        email = EXCLUDED.email,
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        amount_total = EXCLUDED.amount_total,
        currency = EXCLUDED.currency,
        status = EXCLUDED.status,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `,
    [
      purchase.email.toLowerCase(),
      purchase.sessionId,
      purchase.customerId,
      purchase.amountTotal,
      purchase.currency,
      purchase.status,
      JSON.stringify(purchase.metadata),
    ]
  );
}

export async function hasPaidPurchase(email: string): Promise<boolean> {
  await ensureDatabase();

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }

  const result = await query<{ has_purchase: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM purchases
        WHERE email = $1
          AND status IN ('paid', 'complete', 'completed')
      ) AS has_purchase
    `,
    [normalizedEmail]
  );

  return Boolean(result.rows[0]?.has_purchase);
}

export async function getRecentRunsByWorkspace(
  workspaceId: number,
  limit = 8
): Promise<Array<StandupRunRecord & { responseCount: number }>> {
  await ensureDatabase();

  const result = await query<{
    id: number;
    schedule_id: number;
    workspace_id: number;
    channel_id: string;
    standup_date: string;
    posted_ts: string;
    thread_ts: string;
    reminder_sent_at: string | null;
    created_at: string;
    response_count: string;
  }>(
    `
      SELECT
        r.id,
        r.schedule_id,
        r.workspace_id,
        r.channel_id,
        r.standup_date,
        r.posted_ts,
        r.thread_ts,
        r.reminder_sent_at,
        r.created_at,
        COUNT(sr.id)::text AS response_count
      FROM standup_runs r
      LEFT JOIN standup_responses sr ON sr.run_id = r.id
      WHERE r.workspace_id = $1
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT $2
    `,
    [workspaceId, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    scheduleId: row.schedule_id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    standupDate: row.standup_date,
    postedTs: row.posted_ts,
    threadTs: row.thread_ts,
    reminderSentAt: row.reminder_sent_at,
    createdAt: row.created_at,
    responseCount: Number(row.response_count),
  }));
}
