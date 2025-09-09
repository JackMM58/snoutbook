import crypto from 'node:crypto';
import type { Db } from '../db';

export interface FeedEvent {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545 says lines over 75 octets are folded with CRLF + space. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}

export function buildCalendar(name: string, events: FeedEvent[], now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Snoutbook//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(event.start)}`,
      `DTEND:${icsDate(event.end)}`,
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function newFeedToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

interface FeedRow {
  id: string;
  startsAt: Date;
  endsAt: Date;
  petName: string;
  breed: string | null;
  serviceName: string;
  clientName: string;
  phone: string | null;
  address: string | null;
  gateNotes: string | null;
  notes: string | null;
}

/** One groomer's appointments from 30 days back to 90 days ahead, or null for an unknown token. */
export async function getFeedForToken(db: Db, token: string): Promise<string | null> {
  const { rows: staff } = await db.query<{ id: string; name: string; businessName: string }>(
    `SELECT s.id, s.name, b.name AS "businessName"
       FROM staff s JOIN businesses b ON b.id = s.business_id
      WHERE s.ical_token = $1`,
    [token],
  );
  const member = staff[0];
  if (!member) return null;

  const { rows } = await db.query<FeedRow>(
    `SELECT a.id, a.starts_at AS "startsAt", a.ends_at AS "endsAt", a.notes,
            p.name AS "petName", p.breed, sv.name AS "serviceName",
            trim(c.first_name || ' ' || c.last_name) AS "clientName", c.phone,
            NULLIF(concat_ws(', ', c.address_line1, c.address_line2, c.city, c.state || ' ' || c.zip), '') AS address,
            c.gate_notes AS "gateNotes"
       FROM appointments a
       JOIN pets p ON p.id = a.pet_id
       JOIN services sv ON sv.id = a.service_id
       JOIN clients c ON c.id = a.client_id
      WHERE a.groomer_id = $1
        AND a.status IN ('booked', 'checked_in', 'completed')
        AND a.starts_at > now() - interval '30 days'
        AND a.starts_at < now() + interval '90 days'
      ORDER BY a.starts_at`,
    [member.id],
  );

  const events: FeedEvent[] = rows.map((r) => ({
    uid: `${r.id}@calendar.snoutbook`,
    start: r.startsAt,
    end: r.endsAt,
    summary: `${r.petName}${r.breed ? ` (${r.breed})` : ''} – ${r.serviceName}`,
    description: [r.clientName, r.phone, r.gateNotes && `Gate/parking: ${r.gateNotes}`, r.notes].filter(Boolean).join('\n'),
    location: r.address ?? undefined,
  }));
  return buildCalendar(`${member.businessName} – ${member.name}`, events);
}
