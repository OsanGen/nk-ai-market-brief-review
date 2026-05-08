export function isTargetWindow(date = new Date(), config = {}) {
  const timezone = config.timezone || "America/New_York";
  const targetHour = Number(config.targetHourLocal ?? 8);
  const parts = localParts(date, timezone);
  return parts.weekday >= 1 && parts.weekday <= 5 && parts.hour === targetHour;
}

export function shouldRunScheduledSend(date = new Date(), config = {}) {
  return isTargetWindow(date, config);
}

function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    hour12: false
  }).formatToParts(date);
  const weekdayName = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return { weekday: weekdayNumber(weekdayName), hour };
}

function weekdayNumber(value) {
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[value] ?? 0;
}
