import { email, required, type Rules } from "./form";

/**
 * Field rules for each auth form. The forms check them as the user types and
 * the server actions check them again, so both always agree.
 */
export type SignUpField = "firstName" | "lastName" | "email" | "password";
export const signUpRules: Rules<SignUpField> = {
  firstName: [required("First name required")],
  lastName: [required("Last name required")],
  email: [required("Email required"), email()],
  // No strength rules here: WorkOS's password policy decides, and its
  // rejection shows on the field as "Choose a stronger password."
  password: [required("Password required")],
};

export type LogInField = "email" | "password";
export const logInRules: Rules<LogInField> = {
  email: [required("Email required"), email()],
  password: [required("Password required")],
};

export type ForgotPasswordField = "email";
export const forgotPasswordRules: Rules<ForgotPasswordField> = {
  email: [required("Email required"), email()],
};

export type ResetPasswordField = "token" | "password";
export const resetPasswordRules: Rules<ResetPasswordField> = {
  token: [required("This reset link is incomplete. Request a new one.")],
  password: [required("Password required")],
};

export type VerifyEmailField = "code";
export const verifyEmailRules: Rules<VerifyEmailField> = {
  code: [required("Enter the code from your email")],
};
