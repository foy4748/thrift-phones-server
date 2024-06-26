// Import Packages
const express = require("express");
const mongodb = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");
//-----------------------------------------

// -------------------- Initializations --------------------
require("dotenv").config(); // dotenv
const app = express(); // express
const { MongoClient, ServerApiVersion, ObjectId } = mongodb;
//-----------------------------------------

// Middleware options
const corsOptions = {
  origin: [process.env.CLIENT_ADDRESS, process.env.DEV_CLIENT],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  withCredentials: true,
};

// Middlewares
app.use(express.json());
app.use(cors(corsOptions));
app.use(morgan("tiny"));
//-----------------------------------------

//------------------- Accessing Secrets --------------------
const PORT = process.env.PORT || process.env.DEV_PORT;
const { DB_URI, DB_NAME, SECRET_JWT, STRIPE_KEY } = process.env;
//-----------------------------------------

const stripe = require("stripe")(STRIPE_KEY);

//---------------- Middleware Functions -------------------

// Authorization Middleware
const authGuard = async (req, res, next) => {
  const { authtoken } = req.headers;
  try {
    const decoded = jwt.verify(authtoken, SECRET_JWT);
    if (decoded) {
      res.decoded = {};
      res.decoded = decoded;
      next();
    } else {
      res
        .status(403)
        .send({ error: true, message: "Unauthorized action attempted" })
        .end();
    }
  } catch (error) {
    console.error(error.message);
    res
      .status(403)
      .send({ error: true, message: "Auth-z failed. Invalid Token" })
      .end();
  }
};

// Role Checking Middleware
const roleCheck = (role) => {
  return async (req, res, next) => {
    if (res.decoded.role.includes(role)) {
      next();
    } else {
      res
        .status(403)
        .send({ error: true, message: "Auth-z failed. Wrong Role" })
        .end();
    }
  };
};
//-----------------------------------------

//---------------- CONNECT MONGODB -------------------

const client = new MongoClient(DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});
// //
async function run() {
  try {
    // ------------------------ COLLECTIONS ------------------- //
    const usersCollection = client.db(DB_NAME).collection("users");
    const categoryCollection = client.db(DB_NAME).collection("categories");
    const productsCollection = client.db(DB_NAME).collection("products");
    const bookingsCollection = client.db(DB_NAME).collection("bookings");
    const wishlistCollection = client.db(DB_NAME).collection("wishlists");
    const paymentCollection = client.db(DB_NAME).collection("payments");

    // --------------- API END POINTS / Controllers ---------

    app.get("/", async (req, res) => {
      res.send({
        error: false,
        message: "THRIFT PHONES SERVER IS UP AND RUNNING",
      });
    });

    // Handling GET requests ------------------
    // Token Signing API END point
    app.get("/auth", async (req, res) => {
      try {
        const { uid } = req.headers;
        if (uid) {
          const user = await usersCollection.findOne({ uid });
          const role = user.role;
          const authtoken = jwt.sign({ uid, role }, SECRET_JWT);
          res.setHeader("Content-Type", "application/json");
          res.status(200).send({ error: false, authtoken });
        } else {
          return res
            .status(404)
            .send({ error: true, message: "USER DOES NOT EXISTS" });
        }
      } catch (error) {
        console.error(error);
        res.setHeader("Content-Type", "application/json");
        res.status(501).send({ error: true, message: "TOKEN SIGNING FAILED" });
      }
    });
    app.get("/users", async (req, res) => {
      const { role } = req.query;
      try {
        if (role) {
          const results = await usersCollection
            .find({ role: { $in: [role] } })
            .toArray();
          /*
          const results = response.filter((itm) =>
            itm.role.includes(role) && !itm.role.includes("admin")
              ? true
              : false
          );
			*/
          res.setHeader("Content-Type", "application/json");
          res.status(200).send(results);
        }
      } catch (error) {
        console.error(error);
        res.setHeader("Content-Type", "application/json");
        res
          .status(501)
          .send({ error: true, message: "GET ROLE BASED USERS FAILED" });
      }
    });

    app.get("/users/:id", async (req, res) => {
      const { id } = req.params;
      try {
        if (id) {
          const response = await usersCollection.findOne({ uid: id });
          if (response) {
            res.setHeader("Content-Type", "application/json");
            return res.status(200).send(response);
          } else {
            res.setHeader("Content-Type", "application/json");
            return res
              .status(404)
              .send({ error: true, message: "USER NOT FOUND" });
          }
        }
      } catch (error) {
        console.error(error);
        res.setHeader("Content-Type", "application/json");
        res.status(501).send({ error: true, message: "GET USER FAILED" });
      }
    });

    app.get("/categories", async (req, res) => {
      try {
        let query = {};
        const { categoryId } = req.query;
        if (categoryId) {
          query = { _id: ObjectId(categoryId) };
        }
        const response = await categoryCollection.find(query).toArray();
        res.setHeader("Content-Type", "application/json");
        res.status(200).send(response);
      } catch (error) {
        console.error(error);
        res.setHeader("Content-Type", "application/json");
        res.status(501).send({ error: true, message: "GET CATEGORIES FAILED" });
      }
    });

    app.get(
      "/my-products",
      authGuard,
      roleCheck("seller"),
      async (req, res) => {
        try {
          const query = { seller_uid: res.decoded.uid };
          const products = await productsCollection
            .find(query)
            .sort({ postedTime: -1 })
            .toArray();

          res.setHeader("Content-Type", "application/json");
          res.status(200).send(products);
        } catch (error) {
          console.error(error);
          res.setHeader("Content-Type", "application/json");
          res.status(501).send({ error: true, message: "GET PRODUCTS FAILED" });
        }
      }
    );

    app.get("/products", async (req, res) => {
      try {
        const { categoryId, advertised, product_id } = req.query;

        if (categoryId) {
          query = {
            $and: [
              { categoryId },
              { $or: [{ paid: { $exists: false } }, { paid: false }] },
            ],
          };
        }

        if (advertised) {
          query = {
            $and: [
              { advertised: true },
              { $or: [{ paid: { $exists: false } }, { paid: false }] },
            ],
          };
        }

        if (product_id) {
          query = { _id: ObjectId(product_id) };
        }
        const products = await productsCollection
          .find(query)
          .sort({ postedTime: -1 })
          .toArray();

        res.setHeader("Content-Type", "application/json");
        res.status(200).send(products);
      } catch (error) {
        console.error(error);
        res.setHeader("Content-Type", "application/json");
        res.status(501).send({ error: true, message: "GET PRODUCTS FAILED" });
      }
    });

    app.get("/bookings", authGuard, roleCheck("buyer"), async (req, res) => {
      try {
        const { uid } = res.decoded;
        if (!uid) {
          res.status(200).send([]);
        }
        if (uid) {
          const query = { buyer_uid: uid };
          const bookings = await bookingsCollection.find(query).toArray();
          res.status(200).send(bookings);
        }
      } catch (error) {
        console.error(error);
        res.setHeader("Content-Type", "application/json");
        res.status(501).send({ error: true, message: "GET BOOKINGS FAILED!!" });
      }
    });

    /* Get wishlisted products */
    app.get("/wishlist", authGuard, roleCheck("buyer"), async (req, res) => {
      const { uid: buyer_uid } = res.decoded;
      if (buyer_uid) {
        const wishlist = await wishlistCollection.find({ buyer_uid }).toArray();
        const productObjIds = wishlist.map((itm) => itm.product_id);
        const products = await productsCollection
          .find({ _id: { $in: productObjIds } })
          .toArray();
        res.send(products);
      }
    });

    // Handling POST requests ------------------
    /* Post User */
    app.post("/users", async (req, res) => {
      const body = req.body;
      try {
        const response = await usersCollection.insertOne(body);
        response["error"] = false;

        res.setHeader("Content-Type", "application/json");
        res.status(200).send(response);
      } catch (error) {
        console.error(error);
        res.setHeader("Content-Type", "application/json");
        res.status(501).send({ error: true, message: "USER POST FAILED!!" });
      }
    });
    /* Post Product */
    app.post("/products", authGuard, roleCheck("seller"), async (req, res) => {
      try {
        const response = await productsCollection.insertOne(req.body);
        res.setHeader("Content-Type", "application/json");
        res.status(200).send(response);
      } catch (error) {
        console.error(error);
        res.setHeader("Content-Type", "application/json");
        res.status(501).send({ error: true, message: "PRODUCT POST FAILED!!" });
      }
    });

    /* Post Booking */
    app.post("/bookings", authGuard, roleCheck("buyer"), async (req, res) => {
      const body = req.body;
      body["product_id"] = ObjectId(body["product_id"]);
      const query = { _id: ObjectId(body["product_id"]) };
      const checkExistsQuery = {
        product_id: ObjectId(body["product_id"]),
        buyer_uid: res.decoded.uid,
      };

      try {
        await productsCollection.updateOne(query, {
          $set: { booked: true },
        });

        const bookingResponse = await bookingsCollection.updateOne(
          checkExistsQuery,
          { $set: { ...body } },
          { upsert: true }
        );

        res.send(bookingResponse);
      } catch (error) {
        console.error(error);
        res.setHeader("Content-Type", "application/json");
        res.status(501).send({ error: true, message: "BOOKING POST FAILED!!" });
      }
    });

    /* Post product to wishlists */
    app.post("/wishlist", authGuard, roleCheck("buyer"), async (req, res) => {
      const body = req.body;
      body["product_id"] = ObjectId(body["product_id"]);
      const { product_id, seller_uid } = body;
      const { uid: buyer_uid } = res.decoded;
      const query = { $and: [{ product_id }, { seller_uid }, { buyer_uid }] };
      const response = await wishlistCollection.updateOne(
        query,
        { $set: { ...body } },
        {
          upsert: true,
        }
      );
      res.send(response);
    });

    /* Post Payment Intend */
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const calculateOrderAmount = (price) => {
        return price * 100;
      };

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: calculateOrderAmount(price),
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    /* Post Payment Transaction info */
    app.post("/payment", async (req, res) => {
      const query1 = { _id: ObjectId(req.body["product_id"]) };
      const updateResponse = await productsCollection.updateOne(query1, {
        $set: { paid: true },
      });
      const query2 = { product_id: ObjectId(req.body["product_id"]) };
      await bookingsCollection.updateMany(query2, { $set: { paid: true } });
      await wishlistCollection.updateMany(query2, { $set: { paid: true } });
      const insertResponse = await paymentCollection.insertOne(req.body);
      res.send({ updateResponse, insertResponse });
    });

    // Handling PATCH requests ------------------

    /* Patch  seller to verified */
    app.patch("/users", authGuard, roleCheck("admin"), async (req, res) => {
      const { user_id, user_uid } = req.headers;
      const { verified } = req.body;
      try {
        const result = await usersCollection.updateOne(
          { _id: ObjectId(user_id) },
          { $set: { verified } }
        );
        await productsCollection.updateMany(
          { seller_uid: user_uid },
          { $set: { verified } }
        );
        res.status(200).send(result);
      } catch (error) {
        console.error(error);
        res.setHeader("Content-Type", "application/json");
        res.status(501).send({ error: true, message: "PATCH SELLER FAILED!!" });
      }
    });

    /* Patch product to advertise */
    app.patch("/products", authGuard, roleCheck("seller"), async (req, res) => {
      const { product_id } = req.headers;
      const { advertised } = req.body;
      try {
        const result = await productsCollection.updateOne(
          { _id: ObjectId(product_id) },
          { $set: { advertised } }
        );
        res.status(200).send(result);
      } catch (error) {
        console.error(error);
        res.setHeader("Content-Type", "application/json");
        res
          .status(501)
          .send({ error: true, message: "PATCH PRODUCT ADVERTISE FAILED!!" });
      }
    });

    // Handling DELETE requests ------------------

    /* Delete a buyer */
    app.delete(
      "/delete-buyer",
      authGuard,
      roleCheck("admin"),
      async (req, res) => {
        try {
          const { buyer_uid } = req.headers;
          const user = await usersCollection.deleteOne({ uid: buyer_uid });
          const bookings = await bookingsCollection.deleteMany({ buyer_uid });
          const wishlists = await wishlistCollection.deleteMany({ buyer_uid });
          console.log("user", user, "bookings", bookings, "wishes", wishlists);
          res.setHeader("Content-Type", "application/json");
          res.send(user);
        } catch (error) {
          console.error(error);
          res.setHeader("Content-Type", "application/json");
          res
            .status(501)
            .send({ error: true, message: "DELETE BUYER FAILED!!" });
        }
      }
    );

    /* Delete a seller */
    app.delete(
      "/delete-seller",
      authGuard,
      roleCheck("admin"),
      async (req, res) => {
        const { seller_uid } = req.headers;
        const user = await usersCollection.deleteOne({ uid: seller_uid });
        const products = await productsCollection.deleteMany({ seller_uid });
        const bookings = await bookingsCollection.deleteMany({ seller_uid });
        const wishlists = await wishlistCollection.deleteMany({ seller_uid });
        console.log(
          "user",
          user,
          "bookings",
          bookings,
          "wishes",
          wishlists,
          "products",
          products
        );
        res.send(user);
      }
    );

    /* Delete Product */
    app.delete(
      "/delete-products",
      authGuard,
      roleCheck("seller"),
      async (req, res) => {
        try {
          const { product_id } = req.headers;
          const { uid: seller_uid } = res.decoded;
          const products = await productsCollection.deleteOne({
            _id: ObjectId(product_id),
            seller_uid,
          });
          const bookings = await bookingsCollection.deleteMany({
            product_id: ObjectId(product_id),
            seller_uid,
          });

          const wishlists = await wishlistCollection.deleteMany({
            product_id: ObjectId(product_id),
            seller_uid,
          });
          res.status(200).send(products);
        } catch (error) {
          console.error(error);
          res.setHeader("Content-Type", "application/json");
          res
            .status(501)
            .send({ error: true, message: "DELETE PRODUCT FAILED!!" });
        }
      }
    );

    /* Delete a wished item */
    app.delete("/wishlist", authGuard, roleCheck("buyer"), async (req, res) => {
      const { product_id } = req.headers;
      const buyer_uid = res.decoded.uid;
      try {
        const result = await wishlistCollection.deleteOne({
          product_id: ObjectId(product_id),
          buyer_uid,
        });
        res.send(result);
      } catch (error) {
        console.error(error);
        res.setHeader("Content-Type", "application/json");
        res
          .status(501)
          .send({ error: true, message: "DELETE WISHED ITEM FAILED!!" });
      }
    });
  } finally {
  }
}

run().catch((err) => console.error(err));

// Listening to PORT
app.listen(PORT, () => console.log(`SERVER is running at port: ${PORT}`));
