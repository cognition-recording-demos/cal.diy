import dayjs from "@calcom/dayjs";
import prisma from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/enums";
import { expect } from "@playwright/test";
import { test } from "./lib/fixtures";

test.describe.configure({ mode: "parallel" });
test.afterEach(async ({ users }) => {
  await users.deleteAll();
});

const TIMEZONE = "Europe/London";

// next week's Monday, far enough out to clear the default minimum booking notice
const bookingDay = dayjs().tz(TIMEZONE).add(1, "week").startOf("week").add(1, "day");

test.describe("Event type with bufferBeforeMinutes", () => {
  test("slots overlapping the prep time before a booking are hidden", async ({ page, users }) => {
    const user = await users.create({
      overrideDefaultEventTypes: true,
      eventTypes: [
        {
          title: "Prep Buffer",
          slug: "prep-buffer",
          length: 30,
          bufferBeforeMinutes: 60,
        },
      ],
    });

    const eventType = user.eventTypes[0];
    if (!eventType) throw new Error("Event type not found");

    // existing booking 11:00-11:30 in the host's timezone
    const existingBookingStart = bookingDay.hour(11).minute(0).second(0).millisecond(0);
    await prisma.booking.create({
      data: {
        uid: `prep-buffer-${Date.now()}`,
        title: "Existing Booking",
        startTime: existingBookingStart.toDate(),
        endTime: existingBookingStart.add(30, "minutes").toDate(),
        status: BookingStatus.ACCEPTED,
        user: { connect: { id: user.id } },
        eventType: { connect: { id: eventType.id } },
        attendees: {
          create: {
            email: "attendee@example.com",
            name: "Test Attendee",
            timeZone: TIMEZONE,
          },
        },
      },
    });

    const getScheduleResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("getSchedule") && resp.status() === 200
    );
    await page.goto(
      `/${user.username}/prep-buffer?month=${bookingDay.format("YYYY-MM")}&date=${bookingDay.format(
        "YYYY-MM-DD"
      )}`
    );
    const getScheduleResponse = await getScheduleResponsePromise;
    const responseBody = await getScheduleResponse.json();
    const slots: Record<string, { time: string }[]> = responseBody.result.data.json.slots;
    const slotTimes = (slots[bookingDay.format("YYYY-MM-DD")] ?? []).map((slot) =>
      dayjs(slot.time).tz(TIMEZONE).format("HH:mm")
    );

    expect(slotTimes.length).toBeGreaterThan(0);

    // 10:30 is bookable: its 60-minute prep window (09:30-10:30) is free
    expect(slotTimes).toContain("10:30");
    // 11:00 collides with the existing booking itself
    expect(slotTimes).not.toContain("11:00");
    // 11:30 and 12:00 are blocked: their prep windows overlap the 11:00-11:30 booking
    expect(slotTimes).not.toContain("11:30");
    expect(slotTimes).not.toContain("12:00");
    // 12:30 is bookable again: its prep window (11:30-12:30) is free
    expect(slotTimes).toContain("12:30");
  });
});
