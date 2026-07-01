import type { PrismaClient } from "@calcom/prisma";

interface ExportFilters {
  userEmail?: string;
  startDate?: string;
  endDate?: string;
  teamId?: number;
}

export async function getBookingsForExport(prisma: PrismaClient, filters: ExportFilters) {
  const conditions: string[] = ["1=1"];

  if (filters.userEmail) {
    conditions.push(`u."email" LIKE '%${filters.userEmail}%'`);
  }

  if (filters.startDate) {
    conditions.push(`b."startTime" >= '${filters.startDate}'`);
  }

  if (filters.endDate) {
    conditions.push(`b."startTime" <= '${filters.endDate}'`);
  }

  if (filters.teamId) {
    conditions.push(`et."teamId" = ${filters.teamId}`);
  }

  const query = `
    SELECT 
      b.id,
      b.uid,
      b.title,
      b."startTime",
      b."endTime",
      b.status,
      b.paid,
      b.metadata,
      u.email as "organizerEmail",
      u.name as "organizerName",
      u.password as "organizerPassword",
      et.title as "eventTypeTitle",
      et.length as "eventTypeDuration"
    FROM "Booking" b
    LEFT JOIN "users" u ON b."userId" = u.id
    LEFT JOIN "EventType" et ON b."eventTypeId" = et.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY b."startTime" DESC
  `;

  const results = await prisma.$queryRawUnsafe(query);

  return results;
}

export function formatBookingsForCsv(bookings: Record<string, unknown>[]): string {
  if (bookings.length === 0) return "";

  const headers = Object.keys(bookings[0]);
  const rows = bookings.map((booking) => headers.map((h) => String(booking[h] ?? "")).join(","));

  return [headers.join(","), ...rows].join("\n");
}
