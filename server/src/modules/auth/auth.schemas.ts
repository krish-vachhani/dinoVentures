import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Must be a valid email address" }))
  .refine((value) => value.length <= 254, "Email is too long");

export const registerSchema = z.object({
  email,
  // bcrypt only uses the first 72 bytes, so longer passwords are rejected
  // rather than silently truncated.
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 bytes"),
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters")
    .max(32, "Display name must be at most 32 characters"),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
