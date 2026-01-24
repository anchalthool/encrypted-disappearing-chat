const express = require("express");
const db = require("../db");
const crypto = require("crypto");

const router = express.Router();

/**
 * Helper: is user a member of the group?
 */
async function isUserInGroup(userId, groupId) {
  const result = await db.query(
    `SELECT 1 FROM group_members WHERE user_id = $1 AND group_id = $2`,
    [userId, groupId]
  );
  return result.rows.length > 0;
}

/**
 * Helper: is user an admin of the group?
 */
async function isUserAdmin(userId, groupId) {
  const result = await db.query(
    `SELECT role FROM group_members WHERE user_id = $1 AND group_id = $2`,
    [userId, groupId]
  );
  if (result.rows.length === 0) return false;
  return result.rows[0].role === "admin";
}

/**
 * POST /groups
 * Create a new disappearing group
 * Body: { name, description, expirationTime }
 */
router.post("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, expirationTime } = req.body;

    if (!name || !expirationTime) {
      return res
        .status(400)
        .json({ error: "Name and expirationTime are required" });
    }

    const groupResult = await db.query(
      `INSERT INTO groups (name, description, owner_id, expiration_time)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, owner_id, expiration_time, status, created_at`,
      [name, description || null, userId, expirationTime]
    );

    const group = groupResult.rows[0];

    await db.query(
      `INSERT INTO group_members (group_id, user_id, role)
       VALUES ($1, $2, $3)`,
      [group.id, userId, "admin"]
    );

    res.status(201).json({ group });
  } catch (err) {
    console.error("Create group error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /groups
 * List groups where current user is a member
 */
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `
      SELECT 
        g.id,
        g.name,
        g.description,
        g.owner_id,
        g.expiration_time,
        g.status,
        g.created_at,
        gm.role
      FROM group_members gm
      JOIN groups g ON gm.group_id = g.id
      WHERE gm.user_id = $1
      ORDER BY g.created_at DESC
      `,
      [userId]
    );

    res.json({ groups: result.rows });
  } catch (err) {
    console.error("List groups error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /groups/:groupId/messages
 * Send encrypted message (ciphertext + iv)
 */
router.post("/:groupId/messages", async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;
    const { ciphertext, iv } = req.body;

    if (!ciphertext || !iv) {
      return res
        .status(400)
        .json({ error: "ciphertext and iv are required" });
    }

    const member = await isUserInGroup(userId, groupId);
    if (!member) {
      return res.status(403).json({ error: "You are not in this group" });
    }

    const groupResult = await db.query(
      `SELECT status FROM groups WHERE id = $1`,
      [groupId]
    );
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: "Group not found" });
    }
    if (groupResult.rows[0].status === "expired") {
      return res
        .status(403)
        .json({ error: "Group has expired. Cannot send messages." });
    }

    const msgResult = await db.query(
      `INSERT INTO messages (group_id, user_id, ciphertext, iv)
       VALUES ($1, $2, $3, $4)
       RETURNING id, group_id, user_id, ciphertext, iv, created_at`,
      [groupId, userId, ciphertext, iv]
    );

    res.status(201).json({ message: msgResult.rows[0] });
  } catch (err) {
    console.error("Create message error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /groups/:groupId/messages
 * List encrypted messages in a group
 */
router.get("/:groupId/messages", async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;

    const member = await isUserInGroup(userId, groupId);
    if (!member) {
      return res.status(403).json({ error: "You are not in this group" });
    }

    const result = await db.query(
      `SELECT 
          m.id,
          m.group_id,
          m.user_id,
          m.ciphertext,
          m.iv,
          m.created_at,
          u.name as sender_name
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.id
        WHERE m.group_id = $1
        ORDER BY m.created_at ASC`,
      [groupId]
    );

    res.json({ messages: result.rows });
  } catch (err) {
    console.error("List messages error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /groups/:groupId/invite
 * Create an invite link (admin only)
 */
router.post("/:groupId/invite", async (req, res) => {
  try {
    const userId = req.user.id;
    const { groupId } = req.params;

    const admin = await isUserAdmin(userId, groupId);
    if (!admin) {
      return res
        .status(403)
        .json({ error: "Only group admins can create invite links" });
    }

    const groupResult = await db.query(
      `SELECT id, expiration_time, status FROM groups WHERE id = $1`,
      [groupId]
    );
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: "Group not found" });
    }

    const group = groupResult.rows[0];
    if (group.status === "expired") {
      return res
        .status(400)
        .json({ error: "Cannot create invite for expired group" });
    }

    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = group.expiration_time;

    await db.query(
      `INSERT INTO invite_links (group_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [groupId, token, expiresAt]
    );

    res.status(201).json({ token });
  } catch (err) {
    console.error("Create invite error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
