"use client";

import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

interface SchedulerChannel {
  id: string;
  name: string;
}

interface SchedulerSchedule {
  id: number;
  channelId: string;
  timezone: string;
  standupTimeLocal: string;
  daysOfWeek: number[];
  reminderDelayMinutes: number;
  question: string;
  nextRunAt: string;
}

interface StandupSchedulerProps {
  workspaceId: number;
  channels: SchedulerChannel[];
  schedules: SchedulerSchedule[];
  defaultQuestion: string;
}

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
];

function formatDays(days: number[]): string {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days.map((day) => labels[day]).join(", ");
}

export function StandupScheduler({
  workspaceId,
  channels,
  schedules,
  defaultQuestion,
}: StandupSchedulerProps) {
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC"
  );
  const [standupTimeLocal, setStandupTimeLocal] = useState("15:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [reminderDelayMinutes, setReminderDelayMinutes] = useState(120);
  const [question, setQuestion] = useState(defaultQuestion);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const channelLookup = useMemo(() => {
    return new Map(channels.map((channel) => [channel.id, channel.name]));
  }, [channels]);

  const handleDayToggle = (value: number) => {
    setDaysOfWeek((currentDays) => {
      if (currentDays.includes(value)) {
        return currentDays.filter((day) => day !== value);
      }

      return [...currentDays, value].sort((a, b) => a - b);
    });
  };

  const saveSchedule = async () => {
    setStatusMessage(null);
    setErrorMessage(null);

    if (!channelId) {
      setErrorMessage("Pick a Slack channel before saving.");
      return;
    }

    if (daysOfWeek.length === 0) {
      setErrorMessage("Select at least one weekday for automatic standups.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          channelId,
          timezone,
          standupTimeLocal,
          daysOfWeek,
          reminderDelayMinutes,
          question,
        }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to save schedule.");
      }

      setStatusMessage(
        "Schedule saved. Cron can now post standups automatically and send reminder nudges in thread."
      );
      window.location.reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save schedule.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-slate-800 bg-slate-950/60">
        <CardHeader>
          <CardTitle className="text-slate-100">Standup Scheduler</CardTitle>
          <CardDescription className="text-slate-400">
            Set one channel + local time. The scheduler posts a standup thread and sends follow-up reminders
            to missing responders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="standup-channel">Slack Channel</Label>
              <select
                id="standup-channel"
                className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
              >
                {channels.length === 0 ? <option value="">No channels found</option> : null}
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    #{channel.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="standup-time">Local Standup Time</Label>
              <Input
                id="standup-time"
                type="time"
                value={standupTimeLocal}
                onChange={(event) => setStandupTimeLocal(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder="America/New_York"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reminder-delay">Reminder Delay (minutes)</Label>
              <Input
                id="reminder-delay"
                type="number"
                min={30}
                max={720}
                value={reminderDelayMinutes}
                onChange={(event) => setReminderDelayMinutes(Number(event.target.value))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Standup Days</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => {
                const active = daysOfWeek.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => handleDayToggle(day.value)}
                    className={`rounded-md border px-3 py-1 text-sm transition ${
                      active
                        ? "border-cyan-500 bg-cyan-500/20 text-cyan-200"
                        : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="question">Prompt Template</Label>
            <Textarea
              id="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className="min-h-24"
            />
          </div>

          <Button onClick={saveSchedule} disabled={isSaving} className="bg-cyan-500 text-slate-950 hover:bg-cyan-400">
            {isSaving ? "Saving..." : "Save Schedule"}
          </Button>

          {statusMessage ? (
            <Alert className="border-emerald-800 bg-emerald-950/40 text-emerald-100">
              <AlertTitle>Saved</AlertTitle>
              <AlertDescription>{statusMessage}</AlertDescription>
            </Alert>
          ) : null}

          {errorMessage ? (
            <Alert variant="destructive" className="border-red-900 bg-red-950/40 text-red-200">
              <AlertTitle>Schedule Not Saved</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-950/60">
        <CardHeader>
          <CardTitle className="text-slate-100">Active Schedules</CardTitle>
          <CardDescription className="text-slate-400">
            One row per channel. Saving again updates the row for that channel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <p className="text-sm text-slate-400">No schedules yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead>Channel</TableHead>
                  <TableHead>Local Time</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Reminder</TableHead>
                  <TableHead>Next Run (UTC)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => (
                  <TableRow key={schedule.id} className="border-slate-900">
                    <TableCell>
                      <Badge variant="outline" className="border-cyan-700 text-cyan-200">
                        #{channelLookup.get(schedule.channelId) ?? schedule.channelId}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {schedule.standupTimeLocal.slice(0, 5)} ({schedule.timezone})
                    </TableCell>
                    <TableCell>{formatDays(schedule.daysOfWeek)}</TableCell>
                    <TableCell>{schedule.reminderDelayMinutes} min</TableCell>
                    <TableCell>{new Date(schedule.nextRunAt).toUTCString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
