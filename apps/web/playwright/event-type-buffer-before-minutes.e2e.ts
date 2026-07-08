import dayjs from "@calcom/dayjs";
import { expect } from "@playwright/test";
import { test } from "./lib/fixtures";

test.describe.configure({ mode: "parallel" });

test.afterEach(async ({ users }) => {
  await users.deleteAll();
});

const EVENT_LENGTH = 30;
const BUFFER_BEFORE_MINUTES = 120;

// Book next month to avoid minimumBookingNotice / current-day edge cases and land on a weekday
// (the default seeded schedule is Mon-Fri, 9:00-17:00, Europe/London).
const firstDayNextMonth = dayjs().add(1, "month").date(1);
const bookingDate = firstDayNextMonth.day(
  firstDayNextMonth.date() === firstDayNextMonth.startOf("week").date() ? 1 : 8
);

const countAvailableSlots = async (page: import("@playwright/test").Page, username: string, slug: string) => {
  await page.goto(`/${username}/${slug}?month=${bookingDate.format("YYYY-MM")}`);

  const availableDays = page.locator('[data-testid="day"][data-disabled="false"]');
  const bookingDay = availableDays.getByText(bookingDate.date().toString(), { exact: true });
  await expect(bookingDay).toBeVisible({ timeout: 10_000 });
  await bookingDay.click();

  // wait for slots to render for the selected day
  await page.locator('[data-testid="time"]').first().waitFor({ timeout: 10_000 });
  return page.locator('[data-testid="time"]').count();
};

test.describe("Event type bufferBeforeMinutes", () => {
  test("removes booking slots within the prep buffer that follows an existing booking", async ({
    page,
    users,
    bookings,
  }) => {
    const controlSlug = "prep-buffer-control";
    const bufferedSlug = "prep-buffer-enabled";

    const user = await users.create({
      eventTypes: [
        { title: "Prep buffer control", slug: controlSlug, length: EVENT_LENGTH },
        {
          title: "Prep buffer enabled",
          slug: bufferedSlug,
          length: EVENT_LENGTH,
          bufferBeforeMinutes: BUFFER_BEFORE_MINUTES,
        },
      ],
    });

    const username = user.username;
    if (!username) throw new Error("User has no username");

    const controlEventType = user.eventTypes.find((et) => et.slug === controlSlug);
    if (!controlEventType) throw new Error("Control event type not found");

    // Existing booking at 12:00-12:30 (Europe/London). A user-level booking blocks
    // availability across all of the user's event types. Build the instant from the
    // booking day's calendar date so it lands on the same day the booker navigates to
    // (constructing via .tz() on a timestamp can roll over into the next day).
    const existingBookingStart = dayjs.tz(`${bookingDate.format("YYYY-MM-DD")} 12:00`, "Europe/London");
    await bookings.create(user.id, username, controlEventType.id, {
      startTime: existingBookingStart.toDate(),
      endTime: existingBookingStart.add(EVENT_LENGTH, "minutes").toDate(),
    });

    const controlCount = await countAvailableSlots(page, username, controlSlug);
    const bufferedCount = await countAvailableSlots(page, username, bufferedSlug);

    // The prep buffer blocks the slots that start within BUFFER_BEFORE_MINUTES after the
    // existing booking ends, i.e. BUFFER_BEFORE_MINUTES / EVENT_LENGTH extra slots.
    expect(bufferedCount).toBeLessThan(controlCount);
    expect(controlCount - bufferedCount).toBe(BUFFER_BEFORE_MINUTES / EVENT_LENGTH);
    // The buffer should not wipe out the whole day.
    expect(bufferedCount).toBeGreaterThan(0);
  });
});
