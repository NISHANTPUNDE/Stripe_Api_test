const router = require("express").Router()
const express=require('express')
const bodyParser=require('body-parser')
const {getSubscriptionDetail} = require('./msg.controller')
const stripe=require('stripe')(process.env.STRIPE_SECRET_KEY)
const endpointSecret = process.env.WEBHOOK_SIGNING_SECRET;
const pool= require("../../config/db")
  
router.get('/get-subscription-details',getSubscriptionDetail)
router.post("/create-stripe-session-subscription",express.json(),
    async (req, res) => {
        console.log(req.body.email, req.body.planname);
        const userEmail = req.body.email; 
        let customer;
        const auth0UserId = userEmail;
        let session; 
      
        const existingCustomers = await stripe.customers.list({
          email: userEmail,
          limit: 1,
        });
      
        if (existingCustomers.data.length > 0) {
          customer = existingCustomers.data[0];
      
          const subscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            status: "active",
            limit: 1,
          });
      
          if (subscriptions.data.length > 0 ) {
            const stripeSession = await stripe.billingPortal.sessions.create({
              customer: customer.id,
              return_url: "https://admin.shopify.com/store/dev-demosky/apps/subscription-app-142/index",
            });
            return res.status(409).json({ redirectUrl: stripeSession.return_url });
          }
        } else {
          // No customer found, create a new one
          customer = await stripe.customers.create({
            email: userEmail,
            metadata: {
              userId: auth0UserId,
            },
          });
        }
      
        // Now create the Stripe checkout session with the customer ID
        if (req.body.interval === "trial" && existingCustomers.data.length === 0) {
          console.log("hello");
          session = await stripe.checkout.sessions.create({
            success_url:
              "https://admin.shopify.com/store/dev-demosky/apps/subscription-app-142/index",
            cancel_url:
              "https://admin.shopify.com/store/dev-demosky/apps/subscription-app-142/Cancel",
            payment_method_types: ["card"],
            mode: "subscription",
            billing_address_collection: "auto",
            line_items: [
              {
                price_data: {
                  currency: "inr",
                  product_data: {
                    name: req.body.planname,
                    description: "Free Trial",
                  },
                  unit_amount: 0,
                  recurring: { interval: "day", interval_count: 1 },
                },
                quantity: 1,
              },
            ],
            customer_email: userEmail,
            subscription_data: {
              trial_period_days: 7, // Offer a 7-day trial
            },
          });
        } else {

          session = await stripe.checkout.sessions.create({
            success_url:
              "https://admin.shopify.com/store/dev-demosky/apps/subscription-app-142/index",
            cancel_url:
              "https://admin.shopify.com/store/dev-demosky/apps/subscription-app-142/Cancel",
            payment_method_types: ["card"],
            mode: "subscription",
            billing_address_collection: "auto",
            line_items: [
              {
                price_data: {
                  currency: "inr",
                  product_data: {
                    name: req.body.planname,
                    description:
                      req.body.interval === "month"
                        ? "Monthly Subscription"
                        : "Yearly Subscription",
                  },
                  unit_amount: req.body.interval === "month" ? 20000 : 5000000,
                  recurring: {
                    interval: req.body.interval,
                    interval_count: 1,
                  },
                },
                quantity: 1,
              },
            ],
            metadata: {
              userId: auth0UserId,
            },
            customer: customer.id,
          });
        }
        res.json({ id: session.id });

      }
)


router.post("/webhook",bodyParser.raw({ type: "application/json" }),async (req, res) => {
  
    const request=req.body;
    const payload = request;
    const sig = req.headers["stripe-signature"];
    let event;
    // console.log(payload, sig, endpointSecret)
    try {
      event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
    } catch (err) {
      // Log the error
      console.error("Webhook Error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
  
      // On payment successful, get subscription and customer details
      const subscription = await stripe.subscriptions.retrieve(
        event.data.object.subscription,
        console.log(event.data.object.subscription)
      );
      const customer = await stripe.customers.retrieve(
        event.data.object.customer
      );
  
  console.log(subscription)
      if (invoice.billing_reason === "subscription_create") {
  
        const subscriptionDocument = {
          userId: customer?.metadata?.userId,
          subId: event.data.object.subscription,
          endDate: new Date(subscription.current_period_end * 1000).toISOString().split('T')[0],
        };
        console.log(subscriptionDocument);
        try {
          pool.query('INSERT INTO bill (userId, subId, endDate) VALUES (?, ?, ?)', [subscriptionDocument.userId, subscriptionDocument.subId, subscriptionDocument.endDate], (error, results, fields) => {
            if (error) {
              console.error("MySQL Insert Error:", error);
              return;
            }
            console.log("Successfully inserted the document into the collection");
          });
        } catch (err) {
          // Log the error
          console.log("error", err.message)
        }
  
        console.log(
          `First subscription payment successful for Invoice ID: ${customer.email} ${customer?.metadata?.userId}`
        );
      } else if (
        invoice.billing_reason === "subscription_cycle" ||
        invoice.billing_reason === "subscription_update"
      ) {
        // Handle recurring subscription payments
        // DB code to update the database for recurring subscription payments
  
        // Define the filter to find the document with the specified userId
        const userId = customer?.metadata?.userId;
    const endDate = subscription.current_period_end * 1000;
  
    try {
      pool.query(
        'UPDATE bill SET endDate = ? WHERE userId = ?',
        [endDate, userId],
        (error, results, fields) => {
          if (error) {
            console.error("MySQL Update Error:", error);
            return;
          }
          if (results.affectedRows === 0) {
            console.log("No rows matched the query. Data not updated.");
          } else {
            console.log("Successfully updated the data.");
          }
        }
      )} catch (err) {
          // Log the error
          console.error("mysql Update Error:", err.message);
        }
  
      }
  
      console.log(
        new Date(subscription.current_period_end * 1000),
        subscription.status,
        invoice.billing_reason
      );
    }
  
    // For canceled/renewed subscription
    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      // console.log(event);
      if (subscription.cancel_at_period_end) {
        console.log(`Subscription ${subscription.id} was canceled.`);
        // DB code to update the customer's subscription status in your database
      } else {
        console.log(`Subscription ${subscription.id} was restarted.`);
        // get subscription details and update the DB
      }
    }
    if(event.type === "customer.subscription.deleted"){
        const subscription = event.data.object;
        // console.log(subscription)
        }
    res.status(200).end();
  })

module.exports = router;