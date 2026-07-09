import dayjs from "@calcom/dayjs";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { test } from "./lib/fixtures";

test.describe.configure({ mode: "parallel" });

test.afterEach(async ({ users }) => {
  await users.deleteAll();
});

const EVENT_LENGTH = 30;
// Large enough to block every remaining working-hours slot after the existing booking.
const PREP_BUFFER_MINUTES = 480;

// First Monday of next month, at 10:00 in the user's timezone (Europe/London).
// Next month avoids the default 120-minute minimum booking notice, and a weekday
// guarantees the default Mon–Fri 09:00–17:00 schedule has availability.
const getBookingStart = () => {
  const startOfNextMonth = dayjs().tz("Europe/London").add(1, "month").startOf("month");
  const firstMonday = startOfNextMonth.day(startOfNextMonth.day() === 1 ? 1 : 8);
  return firstMonday.hour(10).minute(0).second(0).millisecond(0);
};

const countAvailableSlots = async (page: Page, username: string, slug: string, bookingStart: dayjs.Dayjs) => {
  await page.goto(`/${username}/${slug}?month=${bookingStart.format("YYYY-MM")}`);

  const bookingDay = page
    .locator('[data-testid="day"][data-disabled="false"]')
    .getByText(bookingStart.date().toString(), { exact: true });
  await expect(bookingDay).toBeVisible({ timeout: 10_000 });
  await bookingDay.click();

  const times = page.getByTestId("time");
  await times.nth(0).waitFor({ state: "visible", timeout: 10_000 });
  return times.count();
};

test.describe("Event Type bufferBeforeMinutes", () => {
  test("prep buffer removes booking slots that fall within the buffer window", async ({
    page,
    users,
    bookings,
  }) => {
    const bookingStart = getBookingStart();
    const bookingEnd = bookingStart.add(EVENT_LENGTH, "minutes");

    const user = await users.create({
      eventTypes: [
        { title: "No Buffer", slug: "no-buffer", length: EVENT_LENGTH, bufferBeforeMinutes: 0 },
        {
          title: "Prep Buffer",
          slug: "prep-buffer",
          length: EVENT_LENGTH,
          bufferBeforeMinutes: PREP_BUFFER_MINUTES,
        },
      ],
    });

    const { username } = user;
    if (!username) throw new Error("User has no username");
    const controlEventType = user.eventTypes.find((et) => et.slug === "no-buffer");
    if (!controlEventType) throw new Error("Event types not found");

    // A single accepted booking makes the host busy across all of their event types.
    await bookings.create(user.id, username, controlEventType.id, {
      startTime: bookingStart.toDate(),
      endTime: bookingEnd.toDate(),
    });

    const controlSlots = await countAvailableSlots(page, username, "no-buffer", bookingStart);
    const bufferedSlots = await countAvailableSlots(page, username, "prep-buffer", bookingStart);

    // Without a buffer, only the booked slot is unavailable, so plenty of slots remain.
    expect(controlSlots).toBeGreaterThan(0);
    // The prep buffer blocks the slots following the existing booking, leaving strictly fewer.
    expect(bufferedSlots).toBeLessThan(controlSlots);
  });
});
