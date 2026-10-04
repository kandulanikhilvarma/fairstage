import type { Round } from "./domain";
function escape(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\r", "")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}
function stamp(date: Date) {
  return date
    .toISOString()
    .replaceAll(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}
function fold(line: string) {
  const pieces: string[] = [];
  let current = "";
  for (const char of line) {
    if (Buffer.byteLength(current + char, "utf8") > 73) {
      pieces.push(current);
      current = " ";
    }
    current += char;
  }
  pieces.push(current);
  return pieces.join("\r\n");
}
export function calendarEvent(round: Round) {
  const start = new Date(round.scheduledAt);
  const end = new Date(start.getTime() + round.minutes * 60000);
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Fairstage//Paid Interview//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${round.id}@fairstage`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escape(`${round.kind}: ${round.title}`)}`,
      `DESCRIPTION:${escape(round.terms)}`,
      `URL:${escape(round.meetingUrl)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}
