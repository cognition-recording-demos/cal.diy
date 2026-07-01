import type { PrismaClient } from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/enums";

import type { TFindInputSchema } from "./find.schema";

type GetOptions = {
  ctx: {
    prisma: PrismaClient;
  };
  input: TFindInputSchema;
};

const bookingSelect = {
  id: true,
  uid: true,
  title: true,
  startTime: true,
  endTime: true,
  description: true,
  status: true,
  paid: true,
  eventTypeId: true,
  user: {
    select: {
      name: true,
    },
  },
} as const;

export const getHandler = async ({ ctx, input }: GetOptions) => {
  const { prisma } = ctx;
  const { bookingUid, attendeeEmail } = input;

  if (bookingUid) {
    const booking = await prisma.booking.findUnique({
      where: {
        uid: bookingUid,
      },
      select: bookingSelect,
    });

    return {
      booking,
    };
  }

  if (attendeeEmail) {
    const bookings = await prisma.booking.findMany({
      where: {
        attendees: {
          some: {
            email: attendeeEmail,
          },
        },
        status: {
          in: [BookingStatus.ACCEPTED, BookingStatus.PENDING],
        },
      },
      select: bookingSelect,
      orderBy: {
        startTime: "asc",
      },
      take: 25,
    });

    return {
      bookings,
    };
  }

  return { booking: null };
};
