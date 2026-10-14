import bcrypt from "bcryptjs";
import { config } from "../../config.js";
import { AppError } from "../../lib/errors.js";
import { isUniqueViolation, prisma } from "../../lib/prisma.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";

export interface AccountView {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
}

// Compared against when the email is unknown, so a login attempt takes the
// same time whether or not the account exists (no user enumeration by timing).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("not-a-real-password", config.auth.bcryptRounds);

/** Creates the user and their zero-balance wallet together. */
export async function registerUser(input: RegisterInput): Promise<AccountView> {
  const passwordHash = await bcrypt.hash(input.password, config.auth.bcryptRounds);

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        wallet: { create: {} }, // nested create: same transaction as the user insert
      },
    });
    return toAccountView(user);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict("EMAIL_TAKEN", "An account with this email already exists");
    }
    throw error;
  }
}

export async function verifyCredentials(input: LoginInput): Promise<AccountView> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const passwordMatches = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!user || !passwordMatches) {
    throw AppError.unauthorized("INVALID_CREDENTIALS", "Email or password is incorrect");
  }
  if (user.status !== "ACTIVE") {
    throw AppError.forbidden("ACCOUNT_DISABLED", "This account is disabled");
  }
  return toAccountView(user);
}

export async function getAccount(userId: string): Promise<AccountView & { balance: number }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { wallet: { select: { balance: true } } },
  });
  return { ...toAccountView(user), balance: user.wallet?.balance ?? 0 };
}

function toAccountView(user: { id: string; email: string; displayName: string; createdAt: Date }): AccountView {
  return { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt };
}
