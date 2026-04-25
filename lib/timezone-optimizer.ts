import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export interface TeamTimezoneProfile {
  slackUserId: string;
  displayName: string;
  timezone: string;
  utcOffsetMinutes: number;
}

export interface RankedStandupWindow {
  utcTimestamp: string;
  utcLabel: string;
  participantsInWorkingHours: number;
  comfortScore: number;
  localTimes: Array<{
    slackUserId: string;
    displayName: string;
    timezone: string;
    localLabel: string;
    comfort: "great" | "okay" | "hard";
  }>;
  explanation: string;
}

const DEFAULT_WORKING_HOURS = {
  start: 9,
  end: 17,
};

export function normalizeDaysOfWeek(days: number[] | undefined): number[] {
  const fallback = [1, 2, 3, 4, 5];
  if (!days || days.length === 0) {
    return fallback;
  }

  const clean = Array.from(new Set(days.filter((day) => day >= 0 && day <= 6))).sort(
    (a, b) => a - b
  );

  return clean.length > 0 ? clean : fallback;
}

function scoreHour(hour: number): { score: number; comfort: "great" | "okay" | "hard" } {
  if (hour >= DEFAULT_WORKING_HOURS.start && hour < DEFAULT_WORKING_HOURS.end) {
    return { score: 3, comfort: "great" };
  }

  if ((hour >= 7 && hour < DEFAULT_WORKING_HOURS.start) || (hour >= 17 && hour < 20)) {
    return { score: 1, comfort: "okay" };
  }

  if (hour >= 0 && hour < 6) {
    return { score: -4, comfort: "hard" };
  }

  return { score: -2, comfort: "hard" };
}

function getSafeTimezone(timezone: string): string {
  try {
    formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
    return timezone;
  } catch {
    return "UTC";
  }
}

export function analyzeTimezoneOverlap(
  members: TeamTimezoneProfile[],
  referenceDate: Date = new Date(),
  slotMinutes = 30,
  resultLimit = 5
): RankedStandupWindow[] {
  if (members.length === 0) {
    return [];
  }

  const utcStartOfDay = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );

  const slotsPerDay = Math.floor((24 * 60) / slotMinutes);
  const scoredWindows: RankedStandupWindow[] = [];

  for (let slot = 0; slot < slotsPerDay; slot += 1) {
    const utcMoment = new Date(utcStartOfDay.getTime() + slot * slotMinutes * 60_000);
    let participantsInWorkingHours = 0;
    let comfortScore = 0;

    const localTimes = members.map((member) => {
      const timezone = getSafeTimezone(member.timezone);
      const localDate = toZonedTime(utcMoment, timezone);
      const localHour = localDate.getHours();
      const { score, comfort } = scoreHour(localHour);

      if (comfort !== "hard") {
        participantsInWorkingHours += 1;
      }
      comfortScore += score;

      return {
        slackUserId: member.slackUserId,
        displayName: member.displayName,
        timezone,
        localLabel: formatInTimeZone(utcMoment, timezone, "EEE HH:mm"),
        comfort,
      };
    });

    scoredWindows.push({
      utcTimestamp: utcMoment.toISOString(),
      utcLabel: formatInTimeZone(utcMoment, "UTC", "EEE HH:mm 'UTC'"),
      participantsInWorkingHours,
      comfortScore,
      localTimes,
      explanation:
        participantsInWorkingHours === members.length
          ? "Everyone is inside a reasonable working window."
          : `${participantsInWorkingHours}/${members.length} teammates are in working or near-working hours.`,
    });
  }

  return scoredWindows
    .sort((a, b) => {
      if (b.participantsInWorkingHours !== a.participantsInWorkingHours) {
        return b.participantsInWorkingHours - a.participantsInWorkingHours;
      }

      return b.comfortScore - a.comfortScore;
    })
    .slice(0, resultLimit);
}

export function computeNextRunAt(
  timezone: string,
  standupTimeLocal: string,
  daysOfWeek: number[],
  from: Date = new Date()
): Date {
  const safeTimezone = getSafeTimezone(timezone);
  const normalizedDays = normalizeDaysOfWeek(daysOfWeek);
  const [hourRaw, minuteRaw] = standupTimeLocal.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error("standupTimeLocal must be in HH:mm format.");
  }

  const zonedNow = toZonedTime(from, safeTimezone);

  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const candidateLocal = new Date(zonedNow);
    candidateLocal.setDate(zonedNow.getDate() + dayOffset);
    candidateLocal.setHours(hour, minute, 0, 0);

    const candidateDay = candidateLocal.getDay();
    if (!normalizedDays.includes(candidateDay)) {
      continue;
    }

    const candidateUtc = fromZonedTime(candidateLocal, safeTimezone);
    if (candidateUtc.getTime() > from.getTime()) {
      return candidateUtc;
    }
  }

  throw new Error("Unable to compute next run for the provided schedule.");
}

export function formatStandupDate(utcDate: Date, timezone: string): string {
  return formatInTimeZone(utcDate, getSafeTimezone(timezone), "yyyy-MM-dd");
}

export function formatDayList(days: number[]): string {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const normalized = normalizeDaysOfWeek(days);
  return normalized.map((day) => labels[day]).join(", ");
}
