// paymentRoutes.js
import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import admin from 'firebase-admin';


dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Define price IDs for the three subscription variants
const prices = {

    pro: 'price_1Q9wQVBrGkHC1KDCmwgAvpgw',
    premium: 'price_1Q9wPjBrGkHC1KDC8SUtaut2',
};


async function updateUserSubscription(userId, plan, status, subscriptionId) {
    const db = admin.firestore();

    // Mapping price IDs to plan names (Ensure this matches the Stripe Price IDs)
    const planMapping = {
        'price_1Q9wQVBrGkHC1KDCmwgAvpgw': 'pro',
        'price_1Q9wPjBrGkHC1KDC8SUtaut2': 'premium',
    };

    const newPlan = planMapping[plan] || 'free';  // Default to 'basic' if no match
    const userRef = db.collection('users').doc(userId);

    // Update user subscription status and plan in the database
    await userRef.update({
        subscriptionPlan: newPlan,
        subscriptionTier: newPlan,
        subscriptionStatus: status,
        subscriptionId: subscriptionId,
    });

    console.log(`User ${userId} subscription updated to ${newPlan} with status ${status}`);
}




const router = express.Router();



// Create Stripe Checkout session
router.post('/create-checkout-session', async (req, res) => {
    const { plan, userId } = req.body;
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price: prices[plan],  // Use dynamic price based on the selected plan
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            subscription_data: {
                metadata: {
                    userId: userId,  // Attach the userId in subscription metadata as well
                },
            },
            success_url: `${req.headers.origin || 'http://localhost:3000'}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin || 'http://localhost:3000'}/cancel`,
        });


        res.json({ id: session.url });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});


// Webhook to handle Stripe events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.log(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
            {
                const subscription = event.data.object;
                const userId = subscription.metadata.userId;
                const subscriptionId = subscription.id;

                if (!userId) {
                    throw new Error('userId is missing in the metadata');
                }

                const plan = subscription.items.data[0].price.id;
                const subscriptionStatus = subscription.status;

                await updateUserSubscription(userId, plan, subscriptionStatus, subscriptionId);
                console.log(`User ${userId} subscription updated to plan: ${plan}`);
            }
            break;

        case 'invoice.payment_succeeded':
            {
                const invoice = event.data.object;
                const subscriptionId = invoice.subscription;

                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                const userId = subscription.metadata.userId;

                if (!userId) {
                    throw new Error('userId is missing in the metadata');
                }

                const plan = subscription.items.data[0].price.id;
                const subscriptionStatus = subscription.status;

                await updateUserSubscription(userId, plan, subscriptionStatus, subscriptionId);
                console.log(`User ${userId} subscription updated to plan: ${plan}`);
            }
            break;

        case 'customer.subscription.deleted':
            {
                const subscription = event.data.object;
                const userId = subscription.metadata.userId;

                if (!userId) {
                    throw new Error('userId is missing in the metadata');
                }

                await updateUserSubscription(userId, null, 'canceled', '');
                console.log(`User ${userId}'s subscription canceled`);
            }
            break;

        case 'checkout.session.completed':
            {
                const session = event.data.object;
                const subscriptionId = session.subscription;

                // Retrieve the subscription to get metadata
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                const userId = subscription.metadata.userId;

                if (!userId) {
                    throw new Error('userId is missing in the metadata');
                }

                const plan = subscription.items.data[0].price.id;
                const subscriptionStatus = subscription.status;

                await updateUserSubscription(userId, plan, subscriptionStatus, subscriptionId);
                console.log(`User ${userId} checkout completed with plan: ${plan}`);
            }
            break;

        default:
            console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
});



export default router;