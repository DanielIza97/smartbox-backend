export interface ClassSchedule {
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
}

export interface Occurrence {
  startAt: Date;
  endAt: Date;
}

function parseStartTime(startTime: string): [number, number] {
  const [hours, minutes] = startTime.split(':').map(Number);
  return [hours, minutes];
}

// Deriva las ocurrencias reservables de una clase dentro de [rangeStart,
// rangeEnd] a partir de su patrón recurrente semanal — no hay una tabla de
// ocurrencias materializadas, se computan en el momento (ver decisión E3-01
// en CLAUDE.md).
export function computeOccurrences(
  schedule: ClassSchedule,
  rangeStart: Date,
  rangeEnd: Date,
): Occurrence[] {
  const [hours, minutes] = parseStartTime(schedule.startTime);
  const occurrences: Occurrence[] = [];

  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= rangeEnd) {
    if (cursor.getDay() === schedule.dayOfWeek) {
      const startAt = new Date(cursor);
      startAt.setHours(hours, minutes, 0, 0);
      if (startAt >= rangeStart && startAt <= rangeEnd) {
        const endAt = new Date(
          startAt.getTime() + schedule.durationMinutes * 60_000,
        );
        occurrences.push({ startAt, endAt });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return occurrences;
}

// Valida que un startAt propuesto por el socio caiga exactamente en un
// turno real del patrón recurrente (mismo día de la semana y misma hora de
// inicio) — evita que se reserve un horario arbitrario fuera de la grilla.
export function isValidOccurrence(
  schedule: ClassSchedule,
  startAt: Date,
): boolean {
  const [hours, minutes] = parseStartTime(schedule.startTime);
  return (
    startAt.getDay() === schedule.dayOfWeek &&
    startAt.getHours() === hours &&
    startAt.getMinutes() === minutes
  );
}
