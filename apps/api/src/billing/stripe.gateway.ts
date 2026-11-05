import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';
import { loadEnv } from '@justiceview/config';

/** Thin wrapper over the Stripe SDK so business logic (and tests) never touch it directly. */
@Injectable()
export class StripeGateway {
  private client?: Stripe;
  private c(): Stripe {
    const k = loadEnv().STRIPE_SECRET_KEY; if (!k) throw new ServiceUnavailableException('Billing not configured (awaiting Stripe credentials)');
    return (this.client ??= new Stripe(k, { maxNetworkRetries: 2, timeout: 20_000 }));
  }
  /** Verifies the signature over the RAW body; throws on mismatch. */
  constructEvent(raw: Buffer, signature: string): Stripe.Event {
    const w = loadEnv().STRIPE_WEBHOOK_SECRET; if (!w) throw new ServiceUnavailableException('Webhook secret not configured');
    return this.c().webhooks.constructEvent(raw, signature, w);
  }
  async createCustomer(email: string, userId: string) { return (await this.c().customers.create({ email, metadata: { userId } }, { idempotencyKey: `customer:${userId}` })).id; }
  async checkoutUrl(p: { customerId: string; priceId: string; userId: string; idempotencyKey: string; successUrl: string; cancelUrl: string }) {
    const s = await this.c().checkout.sessions.create({ mode: 'subscription', customer: p.customerId, line_items: [{ price: p.priceId, quantity: 1 }], client_reference_id: p.userId,
      subscription_data: { metadata: { userId: p.userId } }, success_url: p.successUrl, cancel_url: p.cancelUrl, allow_promotion_codes: true,
      // Stripe Tax (needs Stripe Tax enabled and origin address configured in the dashboard): automatic VAT/sales tax + tax ID collection
      ...(loadEnv().STRIPE_TAX === 'true' ? { automatic_tax: { enabled: true }, billing_address_collection: 'required' as const, customer_update: { address: 'auto' as const, name: 'auto' as const }, tax_id_collection: { enabled: true } } : {}) }, { idempotencyKey: p.idempotencyKey });
    if (!s.url) throw new ServiceUnavailableException('Stripe returned no checkout URL'); return s.url;
  }
  async cancelSubscription(id: string) { await this.c().subscriptions.cancel(id); }
  /** Refunds the payment behind an invoice (full amount). The payment-intent field location differs across API versions; both are tried. */
  async refundInvoice(invoiceId: string) {
    const inv = (await this.c().invoices.retrieve(invoiceId)) as unknown as { payment_intent?: string | { id: string } | null };
    const pi = typeof inv.payment_intent === 'string' ? inv.payment_intent : inv.payment_intent?.id;
    if (!pi) throw new ServiceUnavailableException('Could not find the payment for this invoice');
    return this.c().refunds.create({ payment_intent: pi }, { idempotencyKey: `refund:${invoiceId}` });
  }
  async portalUrl(customerId: string, returnUrl: string) { return (await this.c().billingPortal.sessions.create({ customer: customerId, return_url: returnUrl })).url; }
}
