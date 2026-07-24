export function isTargetWindow(date = new Date(), config = {}) {
  const timezone = config.timezone || "America/New_York";
  const targetHour = Number(config.targetHourLocal ?? 4);
  const parts = localParts(date, timezone);
  return parts.hour === targetHour;
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
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return { hour };
}
