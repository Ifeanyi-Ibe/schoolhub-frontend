// Strict input schemas for the BFF auth routes. Unknown fields are refused. Each forwarded body
// is type-checked against the generated contract, so a contract change breaks the build.
import { z } from "zod";
import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];

const code = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{6,32}$/, "Enter the code from your app");
const otp = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code");
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number");
const password = z.string().min(10, "Use at least 10 characters").max(256);

export const loginInput = z.strictObject({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(512),
});
export const mfaCodeInput = z.strictObject({ code });
export const enrollmentConfirmInput = z.strictObject({ code });
export const otpRequestInput = z.strictObject({ phone });
export const otpVerifyInput = z.strictObject({ phone, code: otp });
export const forgotInput = z.strictObject({ identifier: z.string().trim().min(3).max(254) });
export const resetInput = z.strictObject({ token: z.string().min(16).max(512), password });
export const inviteInput = z.strictObject({ token: z.string().min(16).max(512), password });
export const changePasswordInput = z.strictObject({
  currentPassword: z.string().min(1).max(512),
  newPassword: password,
});

// Compile-time proof that the forwarded shapes match the generated contract.
export type UpstreamLoginRequest = Schemas["LoginRequest"];
export type UpstreamMfaCodeRequest = Schemas["MfaCodeRequest"];
export type UpstreamEnrollmentConfirmRequest = Schemas["EnrollmentConfirmRequest"];
export type UpstreamOtpVerifyBody = Schemas["OtpVerifyBody"];
export type UpstreamResetPasswordRequest = Schemas["ResetPasswordRequest"];
export type UpstreamChangePasswordRequest = Schemas["ChangePasswordRequest"];
