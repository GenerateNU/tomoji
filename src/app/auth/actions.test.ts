import { beforeEach, expect, test, vi } from "vitest";
import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs";
import {
  AuthenticationException,
  BadRequestException,
  GenericServerException,
  NotFoundException,
} from "@workos-inc/node";
import { cookies } from "next/headers";
import {
  logInAction,
  requestPasswordResetAction,
  resetPasswordAction,
  signUpAction,
  verifyEmailAction,
} from "./actions";

vi.mock("@workos-inc/authkit-nextjs", () => ({
  getWorkOS: vi.fn(),
  saveSession: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
// Like the real one, redirect() ends the action by throwing.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

const userManagement = {
  createUser: vi.fn(),
  listUsers: vi.fn(),
  authenticateWithPassword: vi.fn(),
  authenticateWithEmailVerification: vi.fn(),
  createPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
};
const cookieJar = new Map<string, string>();
const session = {
  user: { id: "user_1", email: "zahra@example.com" },
  accessToken: "a",
  refreshToken: "r",
};

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar.clear();
  vi.stubEnv("WORKOS_CLIENT_ID", "client_1");
  vi.stubEnv("NEXT_PUBLIC_WORKOS_REDIRECT_URI", "http://localhost:3000/auth/callback");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getWorkOS).mockReturnValue({ userManagement } as never);
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  } as never);
});

const empty = { values: {}, fieldErrors: {}, formError: null };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const signUpFields = {
  firstName: "Zahra",
  lastName: "Wibisana",
  email: "zahra@example.com",
  password: "correct horse",
};

test("sign up creates the user, saves the session and sends the form home", async () => {
  userManagement.createUser.mockResolvedValue({ id: "user_1" });
  userManagement.authenticateWithPassword.mockResolvedValue(session);

  expect(await signUpAction(empty, form(signUpFields))).toEqual({
    values: {},
    fieldErrors: {},
    formError: null,
    redirectTo: "/",
  });

  expect(userManagement.createUser).toHaveBeenCalledWith({
    email: "zahra@example.com",
    password: "correct horse",
    firstName: "Zahra",
    lastName: "Wibisana",
  });
  expect(userManagement.authenticateWithPassword).toHaveBeenCalledWith({
    clientId: "client_1",
    email: "zahra@example.com",
    password: "correct horse",
  });
  expect(saveSession).toHaveBeenCalledWith(session, "http://localhost:3000/auth/callback");
});

test("invalid sign-up input never reaches WorkOS", async () => {
  const state = await signUpAction(empty, form({ ...signUpFields, firstName: "", password: "" }));
  expect(state.fieldErrors).toEqual({
    firstName: "First name required",
    password: "Password required",
  });
  expect(state.values).toEqual({
    firstName: "",
    lastName: "Wibisana",
    email: "zahra@example.com",
  });
  expect(userManagement.createUser).not.toHaveBeenCalled();
});

// Observed: WorkOS checks the password before whether the email is free.
const weakPassword = () =>
  new BadRequestException({
    code: "password_strength_error",
    errors: [{ code: "password_too_short", minimum_length: 10 }],
    requestID: "req",
  });

test("a weak password on a taken email reports the email, since that's the real blocker", async () => {
  userManagement.createUser.mockRejectedValue(weakPassword());
  userManagement.listUsers.mockResolvedValue({
    data: [{ id: "user_existing" }],
  });

  const state = await signUpAction(empty, form(signUpFields));

  expect(userManagement.listUsers).toHaveBeenCalledWith({
    email: "zahra@example.com",
  });
  expect(state.fieldErrors).toEqual({
    email: "That email already has an account. Log in instead.",
  });
});

test("a weak password on a free email reports the password", async () => {
  userManagement.createUser.mockRejectedValue(weakPassword());
  userManagement.listUsers.mockResolvedValue({ data: [] });

  const state = await signUpAction(empty, form(signUpFields));
  expect(state.fieldErrors).toEqual({
    password: "Use at least 10 characters.",
  });
});

test("if the email lookup fails, the password message still shows", async () => {
  userManagement.createUser.mockRejectedValue(weakPassword());
  userManagement.listUsers.mockRejectedValue(new Error("network"));

  const state = await signUpAction(empty, form(signUpFields));
  expect(state.fieldErrors).toEqual({
    password: "Use at least 10 characters.",
  });
});

test("other sign-up failures don't trigger the email lookup", async () => {
  userManagement.createUser.mockRejectedValue(
    new GenericServerException(503, "Service Unavailable", {}, "req"),
  );
  await signUpAction(empty, form(signUpFields));
  expect(userManagement.listUsers).not.toHaveBeenCalled();
});

test("a taken email is reported on the email field, keeping what was typed", async () => {
  userManagement.createUser.mockRejectedValue(
    // Observed shape for an email that already has an account.
    new BadRequestException({
      code: "user_creation_error",
      message: "Could not create user.",
      errors: [
        {
          code: "email_not_available",
          message: "This email is not available.",
        },
      ],
      requestID: "req",
    }),
  );
  const state = await signUpAction(empty, form(signUpFields));
  expect(state).toEqual({
    values: {
      firstName: "Zahra",
      lastName: "Wibisana",
      email: "zahra@example.com",
    },
    fieldErrors: {
      email: "That email already has an account. Log in instead.",
    },
    formError: null,
  });
  expect(saveSession).not.toHaveBeenCalled();
});

test("when WorkOS requires email verification, the pending sign-in is kept server-side", async () => {
  userManagement.authenticateWithPassword.mockRejectedValue(
    new AuthenticationException(
      403,
      {
        code: "email_verification_required",
        pending_authentication_token: "pending-token",
      },
      "req",
    ),
  );
  await expect(
    logInAction(empty, form({ email: "zahra@example.com", password: "correct horse" })),
  ).rejects.toThrow("NEXT_REDIRECT /verify-email");
  expect(JSON.parse(cookieJar.get("tomoji-pending-auth")!)).toEqual({
    token: "pending-token",
    email: "zahra@example.com",
    next: "/",
  });
  expect(saveSession).not.toHaveBeenCalled();
});

test("logging in sends the user to where they were headed", async () => {
  userManagement.authenticateWithPassword.mockResolvedValue(session);
  const state = await logInAction(
    empty,
    form({
      email: "zahra@example.com",
      password: "correct horse",
      next: "/campaigns/abc",
    }),
  );
  expect(state.redirectTo).toBe("/campaigns/abc");
  expect(state.values).toEqual({});
});

test("signing up sends the user to where they were headed", async () => {
  userManagement.createUser.mockResolvedValue({ id: "user_1" });
  userManagement.authenticateWithPassword.mockResolvedValue(session);
  const state = await signUpAction(empty, form({ ...signUpFields, next: "/campaigns/abc" }));
  expect(state.redirectTo).toBe("/campaigns/abc");
});

test.each(["https://evil.com", "//evil.com"])(
  "an off-site next (%s) on log in is ignored",
  async (next) => {
    userManagement.authenticateWithPassword.mockResolvedValue(session);
    const state = await logInAction(
      empty,
      form({ email: "zahra@example.com", password: "correct horse", next }),
    );
    expect(state.redirectTo).toBe("/");
  },
);

test("where the user was headed survives the email verification step", async () => {
  userManagement.authenticateWithPassword.mockRejectedValue(
    new AuthenticationException(
      403,
      {
        code: "email_verification_required",
        pending_authentication_token: "pending-token",
      },
      "req",
    ),
  );
  await expect(
    logInAction(
      empty,
      form({
        email: "zahra@example.com",
        password: "correct horse",
        next: "/campaigns/abc",
      }),
    ),
  ).rejects.toThrow("NEXT_REDIRECT /verify-email");
  expect(JSON.parse(cookieJar.get("tomoji-pending-auth")!).next).toBe("/campaigns/abc");

  userManagement.authenticateWithEmailVerification.mockResolvedValue(session);
  const state = await verifyEmailAction(empty, form({ code: "123456" }));
  expect(state.redirectTo).toBe("/campaigns/abc");
});

test("a tampered next in the pending cookie is ignored", async () => {
  cookieJar.set(
    "tomoji-pending-auth",
    JSON.stringify({
      token: "pending-token",
      email: "z@x.com",
      next: "//evil.com",
    }),
  );
  userManagement.authenticateWithEmailVerification.mockResolvedValue(session);
  const state = await verifyEmailAction(empty, form({ code: "123456" }));
  expect(state.redirectTo).toBe("/");
});

test("wrong credentials show one message for the whole form", async () => {
  userManagement.authenticateWithPassword.mockRejectedValue(
    new GenericServerException(
      400,
      "Invalid credentials for 'zahra@example.com'.",
      { code: "invalid_credentials" },
      "req",
    ),
  );
  const state = await logInAction(empty, form({ email: "zahra@example.com", password: "wrong" }));
  expect(state).toEqual({
    values: { email: "zahra@example.com" },
    fieldErrors: {},
    formError: "Wrong email or password.",
  });
});

test("an outage is logged without credentials and shown as a generic error", async () => {
  userManagement.authenticateWithPassword.mockRejectedValue(
    new GenericServerException(503, "Service Unavailable", {}, "req_42"),
  );
  const state = await logInAction(
    empty,
    form({ email: "zahra@example.com", password: "secret-pw" }),
  );
  expect(state.formError).toBe("Something went wrong. Try again.");
  const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
  expect(logged).toContain("req_42");
  expect(logged).not.toContain("secret-pw");
  expect(logged).not.toContain("zahra@example.com");
});

test("verifying the emailed code finishes sign-in and clears the pending cookie", async () => {
  cookieJar.set(
    "tomoji-pending-auth",
    JSON.stringify({ token: "pending-token", email: "z@x.com" }),
  );
  userManagement.authenticateWithEmailVerification.mockResolvedValue(session);

  expect(await verifyEmailAction(empty, form({ code: "123456" }))).toEqual({
    values: {},
    fieldErrors: {},
    formError: null,
    redirectTo: "/",
  });

  expect(userManagement.authenticateWithEmailVerification).toHaveBeenCalledWith({
    clientId: "client_1",
    code: "123456",
    pendingAuthenticationToken: "pending-token",
  });
  expect(saveSession).toHaveBeenCalledWith(session, "http://localhost:3000/auth/callback");
  expect(cookieJar.has("tomoji-pending-auth")).toBe(false);
});

test("verifying without a pending sign-in asks the user to log in again", async () => {
  const state = await verifyEmailAction(empty, form({ code: "123456" }));
  expect(state.formError).toBe("Your sign-in expired. Log in again to get a new code.");
  expect(userManagement.authenticateWithEmailVerification).not.toHaveBeenCalled();
});

test("a reset request confirms the same way whether or not the account exists", async () => {
  userManagement.createPasswordReset.mockResolvedValueOnce({});
  const known = await requestPasswordResetAction(
    { ...empty, sentTo: null },
    form({ email: "zahra@example.com" }),
  );

  userManagement.createPasswordReset.mockRejectedValueOnce(
    new NotFoundException({
      path: "/user_management/password_reset",
      requestID: "req",
    }),
  );
  const unknown = await requestPasswordResetAction(
    { ...empty, sentTo: null },
    form({ email: "nobody@example.com" }),
  );

  expect(known.sentTo).toBe("zahra@example.com");
  expect(unknown.sentTo).toBe("nobody@example.com");
  expect(unknown.formError).toBeNull();
});

test("resetting the password signs the user in with the new one", async () => {
  userManagement.resetPassword.mockResolvedValue({
    user: { email: "zahra@example.com" },
  });
  userManagement.authenticateWithPassword.mockResolvedValue(session);

  expect(
    await resetPasswordAction(empty, form({ token: "reset-token", password: "new password" })),
  ).toEqual({ values: {}, fieldErrors: {}, formError: null, redirectTo: "/" });

  expect(userManagement.resetPassword).toHaveBeenCalledWith({
    token: "reset-token",
    newPassword: "new password",
  });
  expect(userManagement.authenticateWithPassword).toHaveBeenCalledWith({
    clientId: "client_1",
    email: "zahra@example.com",
    password: "new password",
  });
});

test("resetting the password always lands home, even if a next field is sent", async () => {
  userManagement.resetPassword.mockResolvedValue({
    user: { email: "zahra@example.com" },
  });
  userManagement.authenticateWithPassword.mockResolvedValue(session);
  const state = await resetPasswordAction(
    empty,
    form({
      token: "reset-token",
      password: "new password",
      next: "/campaigns/abc",
    }),
  );
  expect(state.redirectTo).toBe("/");
});

test("an expired reset link asks for a new one", async () => {
  userManagement.resetPassword.mockRejectedValue(
    new NotFoundException({
      path: "/user_management/password_reset/confirm",
      requestID: "req",
    }),
  );
  const state = await resetPasswordAction(empty, form({ token: "old", password: "new password" }));
  expect(state.formError).toBe(
    "This reset link has expired or was already used. Request a new one.",
  );
});
