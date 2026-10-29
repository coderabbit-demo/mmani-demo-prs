/**
 * Demo sign-in: the storefront picks one of these shoppers and sends the
 * matching bearer token. A real deployment would validate an identity
 * provider's session instead; the backend contract (x-customer-id) is the same.
 */
export const DEMO_SHOPPERS = [
  { token: "demo-ada", customerId: "cus_ada0001", name: "Ada" },
  { token: "demo-grace", customerId: "cus_grace01", name: "Grace" },
] as const;

export function customerForToken(authorization: string | undefined): string | undefined {
  const token = authorization?.match(/^Bearer (\S+)$/)?.[1];
  return DEMO_SHOPPERS.find((shopper) => shopper.token === token)?.customerId;
}
