import { computeOccurrences, isValidOccurrence } from './occurrence.util';

describe('occurrence.util', () => {
  // Lunes 2026-07-13 00:00 (dayOfWeek=1) — usado como ancla en varios tests.
  const monday = new Date('2026-07-13T00:00:00');

  describe('computeOccurrences', () => {
    it('devuelve una ocurrencia por cada semana que cae dentro del rango', () => {
      const schedule = {
        dayOfWeek: 1,
        startTime: '09:00',
        durationMinutes: 60,
      };
      const rangeStart = new Date('2026-07-01T00:00:00');
      const rangeEnd = new Date('2026-07-31T23:59:59');

      const occurrences = computeOccurrences(schedule, rangeStart, rangeEnd);

      expect(occurrences.length).toBe(4);
      for (const occ of occurrences) {
        expect(occ.startAt.getDay()).toBe(1);
        expect(occ.startAt.getHours()).toBe(9);
        expect(occ.startAt.getMinutes()).toBe(0);
        expect(occ.endAt.getTime() - occ.startAt.getTime()).toBe(60 * 60_000);
      }
    });

    it('no incluye ocurrencias fuera del rango, aunque caigan el día correcto', () => {
      const schedule = {
        dayOfWeek: 1,
        startTime: '09:00',
        durationMinutes: 60,
      };
      // Rango que corta justo antes de que empiece el turno del lunes.
      const rangeStart = new Date(monday);
      const rangeEnd = new Date(monday);
      rangeEnd.setHours(8, 59, 0, 0);

      const occurrences = computeOccurrences(schedule, rangeStart, rangeEnd);

      expect(occurrences).toEqual([]);
    });

    it('devuelve un array vacío si ningún día del rango coincide con dayOfWeek', () => {
      const schedule = {
        dayOfWeek: 1,
        startTime: '09:00',
        durationMinutes: 60,
      };
      // Un solo día, martes.
      const tuesday = new Date('2026-07-14T00:00:00');
      const rangeEnd = new Date('2026-07-14T23:59:59');

      const occurrences = computeOccurrences(schedule, tuesday, rangeEnd);

      expect(occurrences).toEqual([]);
    });
  });

  describe('isValidOccurrence', () => {
    const schedule = { dayOfWeek: 1, startTime: '09:00', durationMinutes: 60 };

    it('es válido si coincide el día de la semana y la hora exacta', () => {
      const startAt = new Date(monday);
      startAt.setHours(9, 0, 0, 0);

      expect(isValidOccurrence(schedule, startAt)).toBe(true);
    });

    it('es inválido si el día de la semana no coincide', () => {
      const tuesday = new Date('2026-07-14T09:00:00');

      expect(isValidOccurrence(schedule, tuesday)).toBe(false);
    });

    it('es inválido si la hora no coincide exactamente, aunque sea el mismo día', () => {
      const startAt = new Date(monday);
      startAt.setHours(9, 30, 0, 0);

      expect(isValidOccurrence(schedule, startAt)).toBe(false);
    });
  });
});
