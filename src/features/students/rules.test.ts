import { describe, expect, it } from "vitest";
import {
  dateOfBirthProblem,
  documentProblems,
  emailProblem,
  guardianProblems,
  isIsoDate,
  noteProblems,
  phoneProblem,
  registrationProblems,
  uploadProblem,
  type GuardianDraft,
  type RegistrationDraft,
} from "./rules";

const TODAY = "2026-11-21";
const guardian: GuardianDraft = {
  firstName: "Ada",
  lastName: "Okafor",
  phone: "08012345678",
  email: "",
  relationship: "Mother",
  priority: "1",
  isPrimaryPayer: true,
  isEmergencyContact: true,
  canPickup: true,
};
const student: RegistrationDraft = {
  firstName: "Tunde",
  middleName: "",
  lastName: "Bello",
  gender: "Male",
  dateOfBirth: "2015-04-02",
  address: "",
  admissionNo: "",
  admittedOn: "2026-09-07",
  sessionId: "s1",
  classArmId: "a1",
  medicalNotes: "",
  specialNeedsNotes: "",
};

describe("dates", () => {
  it("accepts only real calendar dates", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2023-02-29")).toBe(false);
  });

  it("refuses a date of birth in the future or before 1900", () => {
    expect(dateOfBirthProblem("2026-11-22", TODAY)).toBe("dateOfBirthFuture");
    expect(dateOfBirthProblem("1899-12-31", TODAY)).toBe("dateOfBirthPast");
    expect(dateOfBirthProblem("2015-04-02", TODAY)).toBeNull();
    expect(dateOfBirthProblem("nope", TODAY)).toBe("dateOfBirth");
  });
});

describe("phones and email", () => {
  it("accepts Nigerian and international numbers and refuses short or letter-filled ones", () => {
    expect(phoneProblem("080 1234 5678")).toBeNull();
    expect(phoneProblem("+44 20 7946 0958")).toBeNull();
    expect(phoneProblem("0801")).toBe("phone");
    expect(phoneProblem("0801234abcd")).toBe("phone");
  });

  it("treats an empty email as absent and refuses a malformed one", () => {
    expect(emailProblem("")).toBeNull();
    expect(emailProblem("ada@school.test")).toBeNull();
    expect(emailProblem("ada@school")).toBe("email");
  });
});

describe("registration", () => {
  it("passes a complete student", () => {
    expect(registrationProblems(student, TODAY)).toEqual([]);
  });

  it("requires names, a gender, dates, a session and a class arm", () => {
    expect(
      registrationProblems(
        {
          ...student,
          firstName: "",
          lastName: "",
          gender: "Other",
          admittedOn: "",
          sessionId: "",
          classArmId: "",
        },
        TODAY,
      ),
    ).toEqual([
      "firstNameRequired",
      "lastNameRequired",
      "gender",
      "admittedOn",
      "sessionRequired",
      "classArmRequired",
    ]);
  });

  it("enforces the backend's name and address limits", () => {
    expect(registrationProblems({ ...student, firstName: "x".repeat(61) }, TODAY)).toContain(
      "nameLength",
    );
    expect(registrationProblems({ ...student, address: "x".repeat(201) }, TODAY)).toContain(
      "addressLength",
    );
    expect(registrationProblems({ ...student, medicalNotes: "x".repeat(2001) }, TODAY)).toContain(
      "sensitiveLength",
    );
  });
});

describe("guardians", () => {
  it("passes a guardian with a valid phone and a priority from 1 to 9", () => {
    expect(guardianProblems(guardian)).toEqual([]);
  });

  it("refuses a missing phone, a priority of 0 or 10, and a long relationship", () => {
    expect(guardianProblems({ ...guardian, phone: "" })).toContain("guardian.phoneRequired");
    expect(guardianProblems({ ...guardian, priority: "0" })).toContain("guardian.priority");
    expect(guardianProblems({ ...guardian, priority: "10" })).toContain("guardian.priority");
    expect(guardianProblems({ ...guardian, relationship: "x".repeat(31) })).toContain(
      "guardian.relationshipLength",
    );
  });
});

describe("notes, documents and uploads", () => {
  it("requires a category and text under 1000 characters", () => {
    expect(noteProblems("A note", "Pastoral")).toEqual([]);
    expect(noteProblems("", "Pastoral")).toEqual(["noteRequired"]);
    expect(noteProblems("x".repeat(1001), "Disciplinary")).toEqual(["noteLength"]);
    expect(noteProblems("A note", "Other")).toEqual(["noteCategory"]);
  });

  it("requires a document type under 40 characters and notes under 200", () => {
    expect(documentProblems("Birth certificate", "")).toEqual([]);
    expect(documentProblems("", "")).toEqual(["documentTypeRequired"]);
    expect(documentProblems("x".repeat(41), "")).toEqual(["documentTypeLength"]);
    expect(documentProblems("Report", "x".repeat(201))).toEqual(["documentNotesLength"]);
  });

  it("accepts only the file types and sizes each purpose allows", () => {
    expect(uploadProblem({ type: "application/pdf", size: 1024 }, "document")).toBeNull();
    expect(uploadProblem({ type: "text/csv", size: 1024 }, "document")).toBe("fileType");
    expect(uploadProblem({ type: "text/csv", size: 1024 }, "import")).toBeNull();
    expect(uploadProblem({ type: "application/pdf", size: 0 }, "document")).toBe("fileEmpty");
    expect(uploadProblem({ type: "application/pdf", size: 10 * 1024 * 1024 + 1 }, "document")).toBe(
      "fileTooLarge",
    );
  });
});
