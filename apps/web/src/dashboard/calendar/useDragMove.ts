import { useState, type DragEvent } from 'react';
import { zonedToUtc, type CalendarAppointment } from '@snoutbook/shared';

export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 20;
export const PX_PER_MINUTE = 1;
const SNAP_MINUTES = 15;
const MIME = 'application/x-snoutbook-appointment';

export type MoveHandler = (appt: CalendarAppointment, startsAt: string, groomerId: string) => void;

interface DragPayload {
  id: string;
  /** How far down the card the pointer grabbed it, so the drop lands where the card's top is. */
  grabOffsetPx: number;
}

export function isMovable(appt: CalendarAppointment): boolean {
  return appt.status === 'booked' || appt.status === 'checked_in';
}

/** Drag a card, drop it on a column. The column decides the day and groomer; the drop height decides the time. */
export function useDragMove(appointments: CalendarAppointment[], timeZone: string, onMove: MoveHandler) {
  const [overKey, setOverKey] = useState<string | null>(null);

  function cardProps(appt: CalendarAppointment) {
    if (!isMovable(appt)) return { draggable: false };
    return {
      draggable: true,
      onDragStart: (e: DragEvent<HTMLElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const payload: DragPayload = { id: appt.id, grabOffsetPx: e.clientY - rect.top };
        e.dataTransfer.setData(MIME, JSON.stringify(payload));
        e.dataTransfer.effectAllowed = 'move';
      },
    };
  }

  /** `groomerId` null keeps the appointment with its current groomer (week view). */
  function columnProps(key: string, date: string, groomerId: string | null) {
    return {
      'data-drop-active': overKey === key || undefined,
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!e.dataTransfer.types.includes(MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (overKey !== key) setOverKey(key);
      },
      onDragLeave: () => setOverKey((k) => (k === key ? null : k)),
      onDrop: (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        setOverKey(null);
        const raw = e.dataTransfer.getData(MIME);
        if (!raw) return;
        const payload = JSON.parse(raw) as DragPayload;
        const appt = appointments.find((a) => a.id === payload.id);
        if (!appt) return;

        const top = e.clientY - e.currentTarget.getBoundingClientRect().top - payload.grabOffsetPx;
        const minutes = Math.round(top / PX_PER_MINUTE / SNAP_MINUTES) * SNAP_MINUTES;
        const minuteOfDay = Math.min(Math.max(DAY_START_HOUR * 60 + minutes, DAY_START_HOUR * 60), DAY_END_HOUR * 60 - SNAP_MINUTES);
        const startsAt = zonedToUtc(date, minuteOfDay, timeZone).toISOString();
        const targetGroomer = groomerId ?? appt.groomerId;

        if (startsAt === new Date(appt.startsAt).toISOString() && targetGroomer === appt.groomerId) return;
        onMove(appt, startsAt, targetGroomer);
      },
    };
  }

  return { cardProps, columnProps };
}
