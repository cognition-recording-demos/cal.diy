import prisma from "@calcom/prisma";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const searchSchema = z.object({
  email: z.string().email().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).default(50),
});

async function getHandler(request: NextRequest) {
  const queryParams = Object.fromEntries(request.nextUrl.searchParams.entries());

  const { email, startDate, endDate, limit } = searchSchema.parse(queryParams);

  const where: Record<string, unknown> = {};

  if (email) {
    where.user = { email: { contains: email } };
  }

  if (startDate || endDate) {
    where.startTime = {};
    if (startDate) (where.startTime as Record<string, unknown>).gte = new Date(startDate);
    if (endDate) (where.startTime as Record<string, unknown>).lte = new Date(endDate);
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      user: true,
      attendees: true,
      eventType: {
        include: {
          team: true,
          users: true,
        },
      },
      references: true,
    },
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  console.log(`[Admin Export] Fetched ${bookings.length} bookings for query: ${JSON.stringify(queryParams)}`);

  return NextResponse.json({
    bookings,
    count: bookings.length,
  });
}

export const GET = getHandler;
