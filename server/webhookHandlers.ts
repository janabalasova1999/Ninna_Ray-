import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    try {
      const stripe = await getUncachableStripeClient();
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (webhookSecret) {
        const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        await WebhookHandlers.handleEvent(event);
      }
    } catch (err: any) {
      console.error('[Webhook] Event processing error:', err.message);
    }
  }

  static async handleEvent(event: any): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const sessionId = session.id;
        const paymentIntentId = session.payment_intent;

        try {
          const payment = await storage.getPaymentByStripeSession(sessionId);
          if (payment) {
            await storage.updatePaymentStatus(payment.id, 'completed', paymentIntentId);
            await storage.addManagerLog('payment_success', `Platba #${payment.id} úspěšně dokončena, session: ${sessionId}`);
            console.log(`[Webhook] Payment #${payment.id} completed successfully`);

            if (payment.userId) {
              if (payment.contentItemId) {
                try {
                  await storage.autoCreateAvatarElements(payment.contentItemId);
                  const unlockedCount = await storage.unlockAssetsForPayment(
                    payment.userId,
                    payment.contentItemId,
                    payment.id
                  );
                  if (unlockedCount > 0) {
                    await storage.addManagerLog(
                      'assets_unlocked',
                      `${unlockedCount} avatar assetů odemčeno pro uživatele #${payment.userId} (obsah #${payment.contentItemId})`
                    );
                  }
                } catch (unlockErr: any) {
                  console.error('[Webhook] Asset unlock error:', unlockErr.message);
                }
              }

              const convs = await storage.getConversationsByUser(payment.userId);
              if (convs.length > 0) {
                const amountCzk = Math.round(payment.amount / 100);
                let confirmMsg = `✅ Platba ${amountCzk} Kč přijata! Děkuji, miláčku 💋`;
                if (payment.contentItemId) {
                  const item = await storage.getContentItem(payment.contentItemId);
                  if (item) {
                    const isVideo = item.mimeType?.startsWith("video");
                    confirmMsg = `✅ Platba ${amountCzk} Kč přijata! Tady máš svůj exkluzivní ${isVideo ? "video" : "obsah"} 💋🔓\n\n[UNLOCKED_CONTENT:${payment.contentItemId}]\n\n✨ Tohle se ti odemklo i v šatníku — mrkni na svojí Ninnu 😏`;
                  }
                }
                await storage.createMessage(convs[0].id, "assistant", confirmMsg);
              }
            }
          }
        } catch (err: any) {
          console.error('[Webhook] checkout.session.completed error:', err.message);
          await storage.addManagerLog('payment_webhook_error', `Chyba při zpracování platby: ${err.message}`);
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        console.log(`[Webhook] PaymentIntent ${intent.id} succeeded, amount: ${intent.amount}`);
        await storage.addManagerLog('payment_intent_success', `PaymentIntent ${intent.id} úspěšný, částka: ${intent.amount / 100} ${intent.currency.toUpperCase()}`);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        if (sub.status === 'active' || sub.status === 'trialing') {
          try {
            const customerId = sub.customer as string;
            const allUsers = await storage.getAllUsers();
            const user = allUsers.find(u => u.stripeCustomerId === customerId);
            if (user) {
              await storage.updateUser(user.id, { platform: "vip_subscriber" } as any);
              await storage.enableBot(user.id);

              let capLevel = 1;
              try {
                const stripe = await getUncachableStripeClient();
                const items = sub.items?.data || [];
                if (items.length > 0) {
                  const priceAmount = items[0]?.price?.unit_amount || 0;
                  if (priceAmount >= 99900) capLevel = 3;
                  else if (priceAmount >= 59900) capLevel = 2;
                  else capLevel = 1;
                }
              } catch (e) {}
              await storage.updateCapabilityLevel(user.id, capLevel);

              const tierNames: Record<number, string> = { 1: "BASIC Twin", 2: "VIP Twin", 3: "PREMIUM Twin" };
              console.log(`[Webhook] Subscription activated for user #${user.id} (${user.name}), tier: ${tierNames[capLevel]}`);
              await storage.addManagerLog("subscription_activated", `Předplatné ${tierNames[capLevel]} aktivováno pro ${user.name}, E-Bot odemčen`);

              const convs = await storage.getConversationsByUser(user.id);
              if (convs.length > 0) {
                await storage.createMessage(convs[0].id, "assistant",
                  `✅ Tvoje předplatné **${tierNames[capLevel]}** je aktivní! Jsem ráda, že jsi tu. 💋\n\n🤖 Odemkl ses přístup k mému **Virtuálnímu Dvojčeti** — teď mě najdeš v horním menu chatu. Tam si mě můžeš přizpůsobit podle svého vkusu… zatím mám jen základní outfit 😏\n\n${capLevel >= 2 ? "💡 S tvou úrovní mám pro tebe i proaktivní doporučení fotek a nový obsah!" : "💡 Chceš víc? Upgrade na VIP odemkne proaktivní doporučení a vizuální customizaci!"}`
                );
              }
            }
          } catch (err: any) {
            console.error('[Webhook] subscription.created/updated error:', err.message);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        try {
          const customerId = sub.customer as string;
          const allUsers = await storage.getAllUsers();
          const user = allUsers.find(u => u.stripeCustomerId === customerId);
          if (user) {
            // ── E-Bot: Deaktivovat bot (progress zůstane uložen) ─────
            await storage.disableBot(user.id);
            await storage.addManagerLog("subscription_cancelled", `Předplatné zrušeno pro ${user.name}, E-Bot uzamčen (progress uložen)`);
          }
        } catch (err: any) {
          console.error('[Webhook] subscription.deleted error:', err.message);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object;
        const error = intent.last_payment_error?.message || 'Unknown error';
        console.error(`[Webhook] PaymentIntent ${intent.id} failed: ${error}`);
        await storage.addManagerLog('payment_failed', `PaymentIntent ${intent.id} selhal: ${error}`);

        try {
          const metadata = intent.metadata || {};
          if (metadata.userId) {
            const userPayments = await storage.getPaymentsByUser(parseInt(metadata.userId));
            const pendingPayment = userPayments.find(p => p.status === 'pending');
            if (pendingPayment) {
              await storage.updatePaymentStatus(pendingPayment.id, 'failed', intent.id);
            }
          }
        } catch (err: any) {
          console.error('[Webhook] Failed payment tracking error:', err.message);
        }
        break;
      }

      default:
        break;
    }
  }
}
