require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const groupRoutes = require("./routes/groups");
const authMiddleware = require("./middleware/auth");
const inviteRoutes = require("./routes/invites");


const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

// Auth (public)
app.use("/auth", authRoutes);

// Groups (protected)
app.use("/groups", authMiddleware, groupRoutes);

// Invites (protected: need account to join)
app.use("/invites", authMiddleware, inviteRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
