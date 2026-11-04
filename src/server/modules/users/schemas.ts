import { z } from "zod";
import { ROLE_KEYS } from "@/server/authz/catalog";

const name = z.string().trim().min(3, "Informe o nome completo.").max(120, "Nome muito longo.");
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(160, "E-mail muito longo.")
  .pipe(z.email("E-mail inválido."));
const phone = z
  .string()
  .trim()
  .max(30)
  .optional()
  .transform((v) => (v ? v : undefined));
const storeIds = z.array(z.string().min(1)).max(500).default([]);

export const createUserSchema = z.object({
  name,
  email,
  phone,
  roleKey: z.enum(ROLE_KEYS, "Selecione um perfil."),
  storeIds,
});

export const updateUserSchema = z.object({
  name,
  phone,
  roleKey: z.enum(ROLE_KEYS, "Selecione um perfil."),
  storeIds,
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export type CreateUserInput = z.input<typeof createUserSchema>;
export type UpdateUserInput = z.input<typeof updateUserSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: z.string().min(1, "Informe a nova senha."),
    confirmPassword: z.string().min(1, "Confirme a nova senha."),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "A nova senha precisa ser diferente da atual.",
  });

/** Converte erros do Zod no formato { campo: [mensagens] }. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
