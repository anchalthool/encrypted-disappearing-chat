const express = require("express");
const db = require("../db");

const router = express.Router();

/**
 * POST /invites/:token/join
 * Join a group via invite link token
 */
router.post("/:token/join", async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.params;

    // Find invite
    const inviteResult = await db.query(
      `SELECT il.*, g.name, g.description, g.expiration_time, g.status, g.owner_id
       FROM invite_links il
       JOIN groups g ON il.group_id = g.id
       WHERE il.token = $1`,
      [token]
    );

    if (inviteResult.rows.length === 0) {
      return res.status(404).json({ error: "Invalid invite link" });
    }

    const invite = inviteResult.rows[0];

    // Check invite/link validity
    if (!invite.is_active) {
      return res.status(400).json({ error: "Invite link is inactive" });
    }

    const now = new Date();
    if (invite.expires_at && new Date(invite.expires_at) < now) {
      return res.status(400).json({ error: "Invite link has expired" });
    }

    if (invite.status === "expired") {
      return res.status(400).json({ error: "Group has expired" });
    }

    const groupId = invite.group_id;

    // Upsert membership
    await db.query(
      `
      INSERT INTO group_members (group_id, user_id, role)
      VALUES ($1, $2, 'member')
      ON CONFLICT (group_id, user_id) DO NOTHING
      `,
      [groupId, userId]
    );

    // Return group info in same shape as /groups list
    const groupRes = await db.query(
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
      FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE g.id = $1 AND gm.user_id = $2
      `,
      [groupId, userId]
    );

    const group = groupRes.rows[0];

    res.json({ group });
  } catch (err) {
    console.error("Join via invite error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
