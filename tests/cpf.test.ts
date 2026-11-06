import { describe, expect, it } from "vitest";
import { formatCpf, isValidCpf, maskCpf } from "@/lib/cpf";

describe("CPF", () => {
  it("valida dígitos verificadores", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("11144477735")).toBe(true);
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });
  it("formata e aplica máscara enquanto digita", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    const el = { value: "" } as HTMLInputElement;
    for (const [typed, shown] of [["529", "529"], ["5299", "529.9"], ["5299822", "529.982.2"], ["529982247253", "529.982.247-25"]]) {
      el.value = typed;
      maskCpf({ currentTarget: el });
      expect(el.value).toBe(shown);
    }
  });
});
