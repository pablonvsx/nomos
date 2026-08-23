import { formatDateDigits, formatTimeDigits, isValidDateInput } from "../date-time-input";

describe("formatDateDigits", () => {
  it("inserts the slashes progressively as digits are typed", () => {
    expect(formatDateDigits("3")).toBe("3");
    expect(formatDateDigits("31")).toBe("31");
    expect(formatDateDigits("310")).toBe("31/0");
    expect(formatDateDigits("3105")).toBe("31/05");
    expect(formatDateDigits("31052")).toBe("31/05/2");
    expect(formatDateDigits("31052026")).toBe("31/05/2026");
  });

  it("clamps the day to 1-31 as soon as the group is complete", () => {
    expect(formatDateDigits("35")).toBe("31");
    expect(formatDateDigits("00")).toBe("01");
  });

  it("clamps the month to 1-12 as soon as the group is complete", () => {
    expect(formatDateDigits("0113")).toBe("01/12");
    expect(formatDateDigits("0100")).toBe("01/01");
  });

  it("ignores non-numeric characters and caps to 8 digits (DDMMYYYY)", () => {
    expect(formatDateDigits("31/05/2026abc")).toBe("31/05/2026");
    expect(formatDateDigits("3105202699")).toBe("31/05/2026");
  });

  it("an empty string stays empty", () => {
    expect(formatDateDigits("")).toBe("");
  });
});

describe("formatTimeDigits", () => {
  it("inserts the colon progressively", () => {
    expect(formatTimeDigits("2")).toBe("2");
    expect(formatTimeDigits("23")).toBe("23");
    expect(formatTimeDigits("235")).toBe("23:5");
    expect(formatTimeDigits("2359")).toBe("23:59");
  });

  it("clamps the hour to 0-23 as soon as the group is complete", () => {
    expect(formatTimeDigits("25")).toBe("23");
    expect(formatTimeDigits("00")).toBe("00"); // 00 is a valid hour
  });

  it("clamps the minute to 0-59 as soon as the group is complete", () => {
    expect(formatTimeDigits("1099")).toBe("10:59");
    expect(formatTimeDigits("1000")).toBe("10:00");
  });

  it("caps to 4 digits (HHMM)", () => {
    expect(formatTimeDigits("235999")).toBe("23:59");
  });
});

describe("isValidDateInput", () => {
  it("incomplete dates are considered valid (user is still typing)", () => {
    expect(isValidDateInput("")).toBe(true);
    expect(isValidDateInput("31")).toBe(true);
    expect(isValidDateInput("31/05")).toBe(true);
  });

  it("real calendar dates are valid", () => {
    expect(isValidDateInput("31/05/2026")).toBe(true);
    expect(isValidDateInput("01/01/2026")).toBe(true);
    expect(isValidDateInput("29/02/2024")).toBe(true); // 2024 is a leap year
  });

  it("a day that doesn't exist in the month is invalid (30/31 don't exist in every month)", () => {
    expect(isValidDateInput("31/04/2026")).toBe(false); // April has 30 days
    expect(isValidDateInput("30/02/2026")).toBe(false); // February never has 30
  });

  it("February 29 is only valid in a leap year", () => {
    expect(isValidDateInput("29/02/2024")).toBe(true);
    expect(isValidDateInput("29/02/2025")).toBe(false);
  });
});
