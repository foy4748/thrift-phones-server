// Import Packages
const express = require("express");
const mongodb = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
//-----------------------------------------

// -------------------- Initializations --------------------
require("dotenv").config(); // dotenv
const app = express(); // express
const { MongoClient, ServerApiVersion, ObjectId } = mongodb;
//-----------------------------------------

// Middleware options
//const corsOptions = {
//  origin: [process.env.CLIENT_ADDRESS, process.env.DEV_CLIENT],
//  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
//  withCredentials: true,
//};

// Middlewares
app.use(express.json());
app.use(cors());
//-----------------------------------------

//------------------- Accessing Secrets --------------------
const PORT = process.env.PORT || process.env.DEV_PORT;
const { DB_URI, DB_NAME, SECRET_JWT } = process.env;
//-----------------------------------------

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
    const usersCollection = client.db(DB_NAME).collection("users");
    const categoryCollection = client.db(DB_NAME).collection("categories");
    const productsCollection = client.db(DB_NAME).collection("products");

    // --------------- API END POINTS / Controllers ---------

    // Handling GET requests ------------------
    // Token Signing API END point
    app.get("/auth", async (req, res) => {
      try {
        const { uid } = req.headers;
        const authtoken = jwt.sign({ uid }, SECRET_JWT);
        res.setHeader("Content-Type", "application/json");
        res.status(200).send({ error: false, authtoken });
      } catch (error) {
        console.error(error);
        res.setHeader("Content-Type", "application/json");
        res.status(501).send({ error: true, message: "TOKEN SIGNING FAILED" });
      }
    });

    app.get("/users/:id", async (req, res) => {
      const { id } = req.params;
      try {
        if (id) {
          const response = await usersCollection.findOne({ uid: id });
          res.setHeader("Content-Type", "application/json");
          res.status(200).send(response);
        }
      } catch (error) {
        console.error(error);
        res.setHeader("Content-Type", "application/json");
        res.status(501).send({ error: true, message: "GET CATEGORIES FAILED" });
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

    app.get("/products", async (req, res) => {
      try {
        const { seller_uid, categoryId } = req.query;
        let query;
        if (seller_uid) {
          query = { seller_uid };
        }

        if (categoryId) {
          query = { categoryId };
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
    app.post("/products", async (req, res) => {
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
  } finally {
  }
}

run().catch((err) => console.error(err));

// Listening to PORT
app.listen(PORT, () => console.log(`SERVER is running at port: ${PORT}`));
