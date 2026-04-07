import type { ReportScheduleCadence } from "@prisma/client";

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

type ScheduleLike = {
  cadence: ReportScheduleCadence;
  timezone: string;
  sendDayOfWeek?: number | null;
  sendDayOfMonth?: number | null;
  sendHour: number;
  sendMinute: number;
};

const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function getTimeZoneOffsetMinutes(timeZone: string, date: Date) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const offsetPart = formatted.find((part) => part.type === "timeZoneName")?.value ?? "GMT+0";
  const match = offsetPart.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);

  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] ?? "0");
  const minutes = Number(match[3] ?? "0");

  return sign * (hours * 60 + minutes);
}

function getLocalParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  }).formatToParts(date);

  const findValue = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = findValue("weekday");
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);

  return {
    year: Number(findValue("year")),
    month: Number(findValue("month")),
    day: Number(findValue("day")),
    hour: Number(findValue("hour")),
    minute: Number(findValue("minute")),
    second: Number(findValue("second")),
    weekday: weekdayIndex === -1 ? 0 : weekdayIndex
  };
}

function toCalendarDate(parts: Pick<ReturnType<typeof getLocalParts>, "year" | "month" | "day">): CalendarDate {
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day
  };
}

function shiftCalendarDate(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatCalendarDate(date: CalendarDate) {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function localDateTimeToUtc(
  timeZone: string,
  parts: CalendarDate & {
    hour: number;
    minute: number;
  }
) {
  const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0));
  const firstOffset = getTimeZoneOffsetMinutes(timeZone, guess);
  const firstPass = new Date(guess.getTime() - firstOffset * 60_000);
  const secondOffset = getTimeZoneOffsetMinutes(timeZone, firstPass);

  if (secondOffset === firstOffset) {
    return firstPass;
  }

  return new Date(guess.getTime() - secondOffset * 60_000);
}

function getLatestWeeklyOccurrence(schedule: ScheduleLike, now: Date) {
  const localNow = getLocalParts(now, schedule.timezone);
  const today = toCalendarDate(localNow);
  const sendDay = schedule.sendDayOfWeek ?? 0;
  let diff = (localNow.weekday - sendDay + 7) % 7;

  if (diff === 0) {
    const nowMinutes = localNow.hour * 60 + localNow.minute;
    const sendMinutes = schedule.sendHour * 60 + schedule.sendMinute;

    if (nowMinutes < sendMinutes) {
      diff = 7;
    }
  }

  const occurrenceDate = shiftCalendarDate(today, -diff);
  const windowEndDate = shiftCalendarDate(occurrenceDate, -1);
  const windowStartDate = shiftCalendarDate(occurrenceDate, -7);

  return {
    scheduledFor: localDateTimeToUtc(schedule.timezone, {
      ...occurrenceDate,
      hour: schedule.sendHour,
      minute: schedule.sendMinute
    }),
    windowStartDate,
    windowEndDate
  };
}

function getLatestMonthlyOccurrence(schedule: ScheduleLike, now: Date) {
  const localNow = getLocalParts(now, schedule.timezone);
  const desiredDay = schedule.sendDayOfMonth ?? 1;
  const currentMonthSendDay = Math.min(desiredDay, lastDayOfMonth(localNow.year, localNow.month));
  const nowMinutes = localNow.hour * 60 + localNow.minute;
  const sendMinutes = schedule.sendHour * 60 + schedule.sendMinute;
  const beforeCurrentMonthOccurrence =
    localNow.day < currentMonthSendDay || (localNow.day === currentMonthSendDay && nowMinutes < sendMinutes);

  const occurrenceMonthDate = beforeCurrentMonthOccurrence
    ? shiftCalendarDate({ year: localNow.year, month: localNow.month, day: 1 }, -1)
    : { year: localNow.year, month: localNow.month, day: 1 };
  const occurrenceYear = occurrenceMonthDate.year;
  const occurrenceMonth = occurrenceMonthDate.month;
  const occurrenceDay = Math.min(desiredDay, lastDayOfMonth(occurrenceYear, occurrenceMonth));
  const occurrenceDate = {
    year: occurrenceYear,
    month: occurrenceMonth,
    day: occurrenceDay
  };
  const previousMonthSeed = shiftCalendarDate({ year: occurrenceYear, month: occurrenceMonth, day: 1 }, -1);
  const windowStartDate = {
    year: previousMonthSeed.year,
    month: previousMonthSeed.month,
    day: 1
  };
  const windowEndDate = {
    year: previousMonthSeed.year,
    month: previousMonthSeed.month,
    day: lastDayOfMonth(previousMonthSeed.year, previousMonthSeed.month)
  };

  return {
    scheduledFor: localDateTimeToUtc(schedule.timezone, {
      ...occurrenceDate,
      hour: schedule.sendHour,
      minute: schedule.sendMinute
    }),
    windowStartDate,
    windowEndDate
  };
}

export function describeSchedule(schedule: Pick<ScheduleLike, "cadence" | "sendDayOfWeek" | "sendDayOfMonth" | "sendHour" | "sendMinute" | "timezone">) {
  const timeLabel = `${String(schedule.sendHour).padStart(2, "0")}:${String(schedule.sendMinute).padStart(2, "0")} ${schedule.timezone}`;

  if (schedule.cadence === "WEEKLY") {
    return `Weekly on ${weekdayLabels[schedule.sendDayOfWeek ?? 0]} at ${timeLabel}`;
  }

  return `Monthly on day ${schedule.sendDayOfMonth ?? 1} at ${timeLabel}`;
}

export function getLatestScheduleWindow(schedule: ScheduleLike, now = new Date()) {
  const occurrence =
    schedule.cadence === "WEEKLY"
      ? getLatestWeeklyOccurrence(schedule, now)
      : getLatestMonthlyOccurrence(schedule, now);

  return {
    scheduledFor: occurrence.scheduledFor,
    windowStart: localDateTimeToUtc(schedule.timezone, {
      ...occurrence.windowStartDate,
      hour: 0,
      minute: 0
    }),
    windowEnd: localDateTimeToUtc(schedule.timezone, {
      ...occurrence.windowEndDate,
      hour: 23,
      minute: 59
    }),
    startDate: formatCalendarDate(occurrence.windowStartDate),
    endDate: formatCalendarDate(occurrence.windowEndDate)
  };
}

export function buildReportScheduleRunKey(params: {
  scheduleId: string;
  scheduledFor: Date;
  windowStart: Date;
  windowEnd: Date;
  scope: "ACCOUNT" | "LOCATION";
  scopeKey: string;
}) {
  return [
    params.scheduleId,
    params.scope,
    params.scopeKey,
    params.scheduledFor.toISOString(),
    params.windowStart.toISOString(),
    params.windowEnd.toISOString()
  ].join(":");
}
