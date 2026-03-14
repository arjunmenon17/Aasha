export function gestWeeks(gaDays: number, enrollDate: string): number {
  const daysSince = Math.floor(
    (Date.now() - new Date(enrollDate).getTime()) / 86400000
  );
  return Math.floor((gaDays + daysSince) / 7);
}
