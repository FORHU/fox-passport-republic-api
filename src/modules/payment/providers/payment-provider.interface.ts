export interface CheckoutSessionData {
  providerSessionId: string;
  url: string;
}

export interface PaymentStatusData {
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';
  providerReference?: string;
}

export interface RefundData {
  providerReference: string;
  status: 'pending' | 'succeeded' | 'failed';
}

export interface PaymentProvider {
  /**
   * Creates a checkout session that the user can use to pay.
   */
  createCheckout(
    invoiceId: string,
    amount: number,
    currency: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<CheckoutSessionData>;

  /**
   * Retrieves the current payment status for a given checkout session.
   */
  getPaymentStatus(providerSessionId: string): Promise<PaymentStatusData>;

  /**
   * Refunds a payment.
   */
  refund(providerReference: string, amount?: number): Promise<RefundData>;

  /**
   * Verifies the signature of an incoming webhook payload.
   * Throws an error if invalid.
   */
  verifyWebhook(payload: any, signature: string): any;
}
