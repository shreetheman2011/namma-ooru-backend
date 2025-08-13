const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;
require("dotenv").config();

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());

// MongoDB connection
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/namma-ooru";
let db;
const startServer = async () => {
  console.log("connecting to MongoDB at", MONGODB_URI);
  try {
    console.log("creating MongoClient instance");
    const client = new MongoClient(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
    console.log("connecting...");
    await client.connect();
    console.log("finished connecting");
    db = client.db("ncna");
    console.log("Connected to MongoDB");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
};

startServer();

// Whitelist check endpoint
app.post("/check-whitelist", async (req, res) => {
  console.log("POST /check-whitelist hit");
  const { email } = req.body;
  console.log("Email received:", email);

  if (!email) {
    return res
      .status(400)
      .json({ message: "Email is required", isWhitelisted: false });
  }

  try {
    const membersCollection = db.collection("members");

    const member = await membersCollection.findOne({
      $or: [{ "Spouse email id": email }, { Email: email }],
    });

    if (member) {
      console.log("is whitelisted");

      return res.json({
        isWhitelisted: true,
        message: "Email is whitelisted",
      });
    } else {
      console.log(`Access denied for email: ${email}`);
      return res.json({
        isWhitelisted: false,
        message: "Email not found in authorized members list",
      });
    }
  } catch (error) {
    console.error("Error checking whitelist:", error);
    return res.status(500).json({
      isWhitelisted: false,
      message: "Internal server error",
    });
  }
});

// GET /members?search=term&page=1&limit=20
app.get("/members", async (req, res) => {
  const { search = "", page = 1, limit = 20 } = req.query;

  const membersCollection = db.collection("members");

  const query = {
    $or: [
      { "First name": { $regex: search, $options: "i" } },
      { "Last name": { $regex: search, $options: "i" } },
      { "Spouse first name": { $regex: search, $options: "i" } },
      { "Spouse last name": { $regex: search, $options: "i" } },
      { City: { $regex: search, $options: "i" } },
      { "Chettinad native place": { $regex: search, $options: "i" } },
    ],
  };

  const skip = (Number(page) - 1) * Number(limit);

  const results = await membersCollection
    .find(query)
    .project({
      _id: 1,
      "First name": 1,
      "Last name": 1,
      "Spouse first name": 1,
      "Spouse last name": 1,
      City: 1,
      "Chettinad native place": 1,
    })
    .sort({ "First name": 1 })
    .skip(skip)
    .limit(Number(limit))
    .toArray();

  res.json(results);
});

const { ObjectId } = require("mongodb");

app.get("/members/get/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid ID format" });
  }

  try {
    const member = await db
      .collection("members")
      .findOne({ _id: new ObjectId(id) });

    if (!member) return res.status(404).json({ message: "Not found" });

    res.json(member);
  } catch (err) {
    console.error("Error in /members/:id", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/analytics", async (req, res) => {
  try {
    const membersCollection = db.collection("members");

    // Get native village stats
    const nativeVillageStats = await membersCollection
      .aggregate([
        { $match: { "Chettinad native place": { $ne: null, $ne: "" } } },
        {
          $group: {
            _id: "$Chettinad native place",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 }, // Limit to top 10 for better visualization
      ])
      .toArray();

    // Get city residence stats
    const cityResidenceStats = await membersCollection
      .aggregate([
        { $match: { City: { $ne: null, $ne: "" } } },
        {
          $group: {
            _id: "$City",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 }, // Limit to top 10 for better visualization
      ])
      .toArray();

    // Get kovil stats
    const nagaraKovilStats = await membersCollection
      .aggregate([
        { $match: { Kovil: { $ne: null, $ne: "" } } },
        {
          $group: {
            _id: "$Kovil",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 }, // Limit to top 10 for better visualization
      ])
      .toArray();

    // Get year moved stats
    const yearMovedStats = await membersCollection
      .aggregate([
        { $match: { YearSince: { $ne: null, $ne: "" } } },
        {
          $group: {
            _id: "$YearSince",
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    // Transform the data to match the expected format in the frontend
    const analytics = {
      nativeVillage: nativeVillageStats.map((item) => ({
        name: item._id,
        count: item.count,
      })),
      cityResidence: cityResidenceStats.map((item) => ({
        name: item._id,
        count: item.count,
      })),
      nagaraKovil: nagaraKovilStats.map((item) => ({
        name: item._id,
        count: item.count,
      })),
      yearMoved: yearMovedStats.map((item) => ({
        name: item._id.toString(),
        count: item.count,
      })),
    };

    res.json(analytics);
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/stats/native-village", async (req, res) => {
  const result = await db
    .collection("members")
    .aggregate([
      { $match: { "Chettinad native place": { $ne: null, $ne: "" } } },
      {
        $group: {
          _id: "$Chettinad native place",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ])
    .toArray();

  res.json(result);
});

app.get("/stats/city", async (req, res) => {
  const result = await db
    .collection("members")
    .aggregate([
      { $match: { City: { $ne: null, $ne: "" } } },
      {
        $group: {
          _id: "$City",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ])
    .toArray();

  res.json(result);
});

app.get("/stats/kovil", async (req, res) => {
  const result = await db
    .collection("members")
    .aggregate([
      { $match: { Kovil: { $ne: null, $ne: "" } } },
      {
        $group: {
          _id: "$Kovil",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ])
    .toArray();

  res.json(result);
});

app.get("/stats/year", async (req, res) => {
  const result = await db
    .collection("members")
    .aggregate([
      { $match: { YearSince: { $ne: null, $ne: "" } } },
      {
        $group: {
          _id: "$YearSince",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  res.json(result);
});

// Add this endpoint to your existing Express app

// PUT /members/:id - Update member profile
app.put("/members/:id", async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  try {
    // Remove fields that shouldn't be updated directly
    const { _id, ...fieldsToUpdate } = updateData;

    // Add timestamp for when user updated
    fieldsToUpdate.UserUpdated = new Date();

    const result = await db
      .collection("members")
      .updateOne({ _id: new ObjectId(id) }, { $set: fieldsToUpdate });

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Return the updated member data
    const updatedMember = await db
      .collection("members")
      .findOne({ _id: new ObjectId(id) });

    res.json({
      message: "Profile updated successfully",
      member: updatedMember,
    });
  } catch (error) {
    console.error("Error updating member:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/members/by-email/:email", async (req, res) => {
  const { email } = req.params;

  try {
    const member = await db.collection("members").findOne({
      $or: [{ "Spouse email id": email }, { Email: email }],
    });

    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    res.json(member);
  } catch (error) {
    console.error("Error fetching member by email:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /members/by-category - Get members by specific category and value
app.get("/members/by-category", async (req, res) => {
  const { category, value, search = "" } = req.query;

  if (!category || !value) {
    return res.status(400).json({
      message: "Category and value are required parameters",
    });
  }

  try {
    const membersCollection = db.collection("members");
    let query = {};

    // Map category to database field filter
    switch (category) {
      case "nativeVillage":
        query["Chettinad native place"] = value;
        break;
      case "cityResidence":
        query.City = value;
        break;
      case "nagaraKovil":
        query.Kovil = value;
        break;
      case "yearMoved":
        query.YearSince = value;
        break;
      default:
        return res.status(400).json({
          message:
            "Invalid category. Valid categories: nativeVillage, cityResidence, nagaraKovil, yearMoved",
        });
    }

    // If search term exists, add OR regex condition on name fields
    if (search && search.trim() !== "") {
      query.$and = [
        { ...query },
        {
          $or: [
            { "First name": { $regex: search, $options: "i" } },
            { "Last name": { $regex: search, $options: "i" } },
            { "Spouse first name": { $regex: search, $options: "i" } },
            { "Spouse last name": { $regex: search, $options: "i" } },
          ],
        },
      ];
      // Note: Because query already contains category filter, we wrap with $and
      // If you want, can rearrange query differently
    }

    const members = await membersCollection
      .find(query)
      .project({
        _id: 1,
        "First name": 1,
        "Last name": 1,
        "Spouse first name": 1,
        "Spouse last name": 1,
        City: 1,
        "Chettinad native place": 1,
        Kovil: 1,
        YearSince: 1,
        Email: 1,
        "Spouse email id": 1,
        "Mobile number": 1,
        "Spouse mobile number": 1,
      })
      .sort({ "First name": 1 })
      .toArray();

    res.json(members);
  } catch (error) {
    console.error("Error fetching members by category:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    database: db ? "Connected" : "Disconnected",
  });
});
// PUT /members/:id/photo - update photo_link only
app.put("/members/:id/photo", async (req, res) => {
  const { id } = req.params;
  const { photo_link } = req.body;

  if (!photo_link) {
    return res.status(400).json({ message: "photo_link is required" });
  }

  try {
    const result = await db.collection("members").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: { photo_link, UserUpdated: new Date() },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Member not found" });
    }

    const updatedMember = await db
      .collection("members")
      .findOne({ _id: new ObjectId(id) });

    res.json({
      message: "Photo updated successfully",
      member: updatedMember,
    });
  } catch (error) {
    console.error("Error updating photo:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.post("/send-email", async (req, res) => {
  const { recipients, subject, body } = req.body;

  if (!recipients || !body) {
    return res
      .status(400)
      .json({ message: "Recipients and body are required" });
  }

  try {
    const toArray = recipients
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e);

    const msg = {
      to: toArray,
      from: "NAAM <shree.manickaraja@gmail.com>",
      subject: "NAAM - A New Event Has Been Posted - " + subject,
      html: `<p>${body}</p>`,
    };

    await sgMail.sendMultiple(msg);
    res.json({ message: "Emails sent successfully" });
  } catch (error) {
    console.error("Error sending email:", error);
    res
      .status(500)
      .json({ message: "Failed to send email", error: error.message });
  }
});

module.exports = app;
