export interface CreateCheckoutSessionParams {
  amount: number;
  currency?: string;
  productName: string;
  description?: string;
  metadata: { bookingId: string } & Record<string, string>;
  successUrl: string;
  cancelUrl: string;
}
