const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();
const cors = require('cors');
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);
const nodemailer = require('nodemailer');
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// sendEmail
const sendEmail = (emailData, email) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.NODEMAILER_EMAIL,
            pass: process.env.NODEMAILER_API_PASS_KEY
        }
    });

    const mailOptions = {
        from: process.env.NODEMAILER_EMAIL,
        to: email,
        subject: emailData?.subject,
        html: `<p>${emailData?.message}</p>`
    };

    transporter.sendMail(mailOptions,
        function (error, info) {
            if (error) {
                console.log(error);
            } else {
                console.log('Email sent: ' + info.response);
                // do something useful
            }
        }
    )
}

// JWT verify middleware
const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: "Unauthorized review" });
    };
    //bearer Token
    const token = authorization.split(" ")[1];
    jwt.verify(token, process.env.JWT_SECRETE_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: "Unauthorized access" });
        };
        req.decoded = decoded;
        next();
    });
};


// Mongo Db

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@cluster0.so7cytz.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();

        // collections
        const usersCollection = client.db("organicDb").collection("users");
        const itemsCollection = client.db("organicDb").collection("items");
        const reviewsCollection = client.db("organicDb").collection("reviews");
        const cardsCollection = client.db("organicDb").collection("cards");
        const paymentsCollection = client.db("organicDb").collection("payments");
        const bannersCollection = client.db("organicDb").collection("banners");

        app.post("/jwt", async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.JWT_SECRETE_TOKEN, { expiresIn: "1d" });
            return res.status(200).send({ token })
        });

        //warning fast use verifyJWT then use verifyAdmin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user?.role !== "admin") {
                return res.status(403).send({ error: true, message: "Forbidden access" });
            };
            next();
        };

        //banner collection
        app.post("/addBanner", async (req, res) => {
            const banner = req.body;
            const result = await bannersCollection.insertOne(banner);
            res.send(result);
        });

        app.get("/banner", async (req, res) => {
            const result = await bannersCollection.find({}).toArray();
            res.send(result);
        });

        app.delete("/deleteBanner/:id", async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await bannersCollection.deleteOne(query);
            res.send(result);
        });

        // users collection
        app.post("/users", async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ error: "Email already exists" });
            }
            const result = await usersCollection.insertOne(user);
            sendEmail({
                subject: "Account Create Success fully",
                message: "please verify your account and enjoy more future"
            }, user?.email);
            res.send(result);
        });

        app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find({}).toArray();
            res.send(result);
        });


        app.patch("/users/admin/:id", async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: "admin"
                }
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        app.get("/users/admin/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ admin: false });
            };
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === "admin" };
            res.send(result);
        });

        app.delete("/user/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        });

        //Items collection

        app.post("/items", verifyJWT, verifyAdmin, async (req, res) => {
            const items = req.body;
            const result = await itemsCollection.insertOne(items);
            res.send(result);
        });

        app.get("/items", async (req, res) => {
            const result = await itemsCollection.find({}).toArray();
            res.send(result);
        });

        app.get("/items/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await itemsCollection.findOne(query);
            res.send(result);
        });

        app.put("/items/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const option = { upsert: true };
            const updateDoc = { $set: { ...req.body } };
            const result = await itemsCollection.updateOne(filter, updateDoc, option);
            console.log("result", result)
            res.send(result);
        });

        app.delete("/items/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await itemsCollection.deleteOne(query);
            res.send(result);
        })



        //reviews collection
        app.post("/review", verifyJWT, async (req, res) => {
            const review = req.body;
            const result = await reviewsCollection.insertOne(review);
            res.send(result);
        });

        app.get("/reviews", async (req, res) => {
            const result = await reviewsCollection.find({}).toArray();
            res.send(result);
        });

        app.get("/review/:email", verifyJWT, async (req, res) => {
            const query = req.params.email;
            const result = await reviewsCollection.find({ email: query }).toArray();
            res.send(result);
        });

        app.get("/editReviews/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await reviewsCollection.findOne(query);
            res.send(result);
        });

        app.put("/updateReview/:id", async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const option = { upsert: true };
            const updateDoc = { $set: { ...req.body } };
            const result = await reviewsCollection.updateOne(filter, updateDoc, option);
            res.send(result);
        });

        app.delete("/review/:id", verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await reviewsCollection.deleteOne(query);
            res.send(result);
        });

        //card collection
        app.post("/cards", async (req, res) => {
            const cardData = req.body;
            const result = await cardsCollection.insertOne(cardData);
            sendEmail({
                subject: "your order is success fully",
                message: `Order Id: ${cardData?._id}`
            }, cardData?.email);
            res.send(result);
        });

        app.get("/cards", verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                return res.send([]);
            };
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: "Forbidden access" });
            }
            const query = { email: email };
            const result = await cardsCollection.find(query).toArray();
            res.send(result);
        });

        app.get("/card", verifyJWT, verifyAdmin, async (req, res) => {
            const result = await cardsCollection.find({}).toArray();
            res.send(result);
        });


        app.delete("/cards/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = cardsCollection.deleteOne(query);
            res.send(result);
        });



        // create-payment-intent
        // app.post("/create-payment-intent", verifyJWT, async (req, res) => {
        //     const { price } = req.body;

        //     // Validate the 'price' input to ensure it's a valid positive number.
        //     if (typeof price !== 'number' || price <= 0) {
        //         return res.status(400).json({ error: 'Invalid price value' });
        //     }

        //     const amount = price * 100;

        //     if (amount < 1) {
        //         return res.status(400).json({ error: 'Amount must be greater than or equal to 1' });
        //     }

        //     const paymentIntent = await stripe.paymentIntents.create({
        //         amount: amount,
        //         currency: "usd",
        //         payment_method_types: ["card"]
        //     });

        //     res.send({
        //         clientSecret: paymentIntent.client_secret
        //     });
        // });

        // app.post("/payments", verifyJWT, async (req, res) => {
        //     const payment = req.body;
        //     const insertResult = await paymentsCollection.insertOne(payment);

        //     const query = { _id: { $in: payment.cartItemsId.map(id => new ObjectId(id)) } };
        //     const deleteResult = await cardsCollection.deleteMany(query);
        //     res.send({ insertResult, deleteResult });
        // });

        //admin status
        app.get("/admin-status", verifyJWT, verifyAdmin, async (req, res) => {
            const users = await usersCollection.estimatedDocumentCount();
            const products = await itemsCollection.estimatedDocumentCount();
            const orders = await paymentsCollection.estimatedDocumentCount();
            const payments = await paymentsCollection.find({}).toArray();

            const revenue = payments.reduce((sum, payment) => sum + payment.price, 0);

            res.send({
                revenue,
                users,
                products,
                orders
            })
        });


        //pipeline problem 
        // app.get("/order-stats", async (req, res) => {
        //         const pipeline = [
        //             {
        //                 $lookup: {
        //                     from: 'items',
        //                     localField: 'itemsId',
        //                     foreignField: '_id',
        //                     as: 'menuItemsData'
        //                 }
        //             },
        //             {
        //                 $unwind: '$menuItemsData'
        //             },
        //             console.log("pipeline1"),
        //             {
        //                 $group: {
        //                     _id: '$menuItemsData.category',
        //                     count: { $sum: 1 },
        //                     total: { $sum: '$menuItemsData.price' }
        //                 }
        //             },
        //             console.log("pipeline2",),
        //             {
        //                 $project: {
        //                     category: '$_id',
        //                     count: 1,
        //                     total: { $round: ['$total', 2] },
        //                     _id: 0
        //                 }
        //             }
        //         ];

        //         try {
        //             const result = await paymentsCollection.aggregate(pipeline).toArray();
        //             console.log(result);
        //             res.send(result);
        //         } catch (error) {
        //             console.error(error);
        //             res.status(500).send("Internal Server Error");
        //         }
        // });



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
    } finally {
    }
};
run().catch(console.dir);


app.get("/", (req, res) => {
    res.send(`Shop is running port: ${port}`);
});

app.listen(port, () => {
    console.log(`Server started on http://localhost:${port}`)
});