import { describe, expect, it } from "vitest";
import {
  EMPTY_STAFF_DRAFT,
  assignmentProblems,
  assignmentRequest,
  draftFromStaff,
  inviteProblems,
  lagosToday,
  isPendingLeave,
  leaveProblems,
  staffProblems,
  staffRequest,
  type StaffDraft,
} from "./rules";

const TODAY = "2026-11-21";

const valid: StaffDraft = {
  ...EMPTY_STAFF_DRAFT,
  firstName: "Ngozi",
  lastName: "Eze",
  gender: "Female",
  dateOfBirth: "1990-04-12",
  phone: "08033334444",
  jobTitle: "Mathematics teacher",
  hireDate: "2024-09-02",
};

describe("staff form", () => {
  it("accepts a complete record", () => {
    expect(staffProblems(valid, TODAY)).toEqual([]);
  });

  it("names the required fields and the phone and date rules", () => {
    const problems = staffProblems(
      { ...valid, firstName: " ", phone: "", dateOfBirth: "2030-01-01", hireDate: "2024-02-30" },
      TODAY,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        "firstNameRequired",
        "phoneRequired",
        "dateOfBirthFuture",
        "hireDate",
      ]),
    );
  });

  it("refuses a staff type or employment type the contract does not list", () => {
    expect(staffProblems({ ...valid, staffType: "Janitor" }, TODAY)).toContain("staffType");
    expect(staffProblems({ ...valid, employmentType: "Seasonal" }, TODAY)).toContain(
      "employmentType",
    );
  });

  it("sends every field, with empty optional text as null", () => {
    const body = staffRequest({
      ...valid,
      middleName: "  ",
      email: "",
      address: "",
      department: "",
    });
    expect(body).toMatchObject({
      middleName: null,
      email: null,
      address: null,
      department: null,
      firstName: "Ngozi",
    });
    expect(Object.keys(body)).toHaveLength(13);
  });

  it("reads an existing record back into the form, nulls as empty text", () => {
    const draft = draftFromStaff({
      firstName: "A",
      lastName: "B",
      gender: "Male",
      dateOfBirth: "1980-01-01",
      phone: "08000000000",
      staffType: "Admin",
      jobTitle: "Bursar",
      employmentType: "FullTime",
      hireDate: "2020-01-01",
      middleName: null,
      email: null,
    });
    expect(draft.middleName).toBe("");
    expect(draft.email).toBe("");
  });
});

describe("leave", () => {
  it("requires a type and a range that does not end before it starts", () => {
    expect(leaveProblems({ leaveType: "", startsOn: "2026-12-01", endsOn: "2026-12-05" })).toEqual([
      "leaveTypeRequired",
    ]);
    expect(
      leaveProblems({ leaveType: "Annual", startsOn: "2026-12-05", endsOn: "2026-12-01" }),
    ).toEqual(["endsBeforeStart"]);
    expect(
      leaveProblems({ leaveType: "Annual", startsOn: "2026-12-01", endsOn: "2026-12-01" }),
    ).toEqual([]);
  });

  it("treats a leave request as pending until a decision time is recorded", () => {
    expect(isPendingLeave(null)).toBe(true);
    expect(isPendingLeave(undefined)).toBe(true);
    expect(isPendingLeave("2026-11-20T10:00:00Z")).toBe(false);
  });
});

describe("assignments", () => {
  it("allows one form teacher per class arm in a payload", () => {
    expect(
      assignmentProblems([
        { classArmId: "arm-1", subjectId: "", isFormTeacher: true },
        { classArmId: "arm-2", subjectId: "", isFormTeacher: true },
      ]),
    ).toEqual([]);
    expect(
      assignmentProblems([
        { classArmId: "arm-1", subjectId: "", isFormTeacher: true },
        { classArmId: "arm-1", subjectId: "maths", isFormTeacher: true },
      ]),
    ).toEqual(["formTeacherTwice"]);
  });

  it("refuses the same arm and subject twice, and sends empty subjects as null", () => {
    expect(
      assignmentProblems([
        { classArmId: "arm-1", subjectId: "maths", isFormTeacher: false },
        { classArmId: "arm-1", subjectId: "maths", isFormTeacher: false },
      ]),
    ).toEqual(["assignmentDuplicate"]);
    expect(
      assignmentRequest([{ classArmId: "arm-1", subjectId: "", isFormTeacher: true }]),
    ).toEqual([{ classArmId: "arm-1", subjectId: null, isFormTeacher: true }]);
  });
});

describe("invitations", () => {
  it("needs a contact and at least one role", () => {
    expect(inviteProblems({ email: "", phone: "", roleNames: ["Teacher"] })).toEqual([
      "contactRequired",
    ]);
    expect(inviteProblems({ email: "a@b.co", phone: "", roleNames: [] })).toEqual(["roleRequired"]);
    expect(inviteProblems({ email: "a@b.co", phone: "", roleNames: ["Teacher"] })).toEqual([]);
  });
});

describe("the school's calendar", () => {
  it("takes today in Africa/Lagos, not the device's day", () => {
    // 23:30 UTC on 21 November is already 22 November in Lagos (UTC+1).
    expect(lagosToday(new Date("2026-11-21T23:30:00Z"))).toBe("2026-11-22");
    expect(lagosToday(new Date("2026-11-21T10:00:00Z"))).toBe("2026-11-21");
  });
});
