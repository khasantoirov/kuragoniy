/** The platform's name on its certificates and the public check page. */
export const ORG = "KO'RAGONIY EDU"

export function verifyUrl(code: string) {
  return `${window.location.origin}/verify/${code}`
}
