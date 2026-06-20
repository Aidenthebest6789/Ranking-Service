import express from "express";
import config from "./config.js";
import {
  getRanks,
  findUserInGame,
  getUserRankInGroup,
  setUserRank,
} from "./roblox.js";
import { checkCooldown, setCooldown } from "./cooldown.js";

const app = express();
app.use(express.json());

// ══════════════════════════════════════════════
//              DISCORD WEBHOOK
// ══════════════════════════════════════════════

async function sendWebhook(action, caller, target, extraInfo) {
  if (!config.webhookUrl) return;

  const colorMap = { promote: 0x1cac54, demote: 0xc43030, setrank: 0x5865f2 };
  const emojiMap = { promote: "⬆️", demote: "⬇️", setrank: "🔧" };

  const embed = {
    title: `${emojiMap[action] || "📋"} ${
      action.charAt(0).toUpperCase() + action.slice(1)
    } — Ranking Log`,
    color: colorMap[action] || 0x99aab5,
    fields: [
      {
        name: "👤 Caller",
        value: `**${caller.displayName}** (@${caller.username})\nUser ID: \`${caller.userId}\``,
        inline: true,
      },
      {
        name: "🎯 Target",
        value: `**${target.displayName}** (@${target.username})\nUser ID: \`${target.userId}\``,
        inline: true,
      },
      {
        name: "📊 Result",
        value: extraInfo,
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: "Roblox Ranking System" },
  };

  try {
    await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (err) {
    console.error("[WEBHOOK ERROR]", err.message);
  }
}

// ══════════════════════════════════════════════
//              ROUTES
// ══════════════════════════════════════════════

app.post("/test", (req, res) => {
  res.json({ success: true, message: "Backend hit successfully." });
});

app.get("/ranks", async (req, res) => {
  try {
    const ranks = await getRanks();
    res.json({ success: true, ranks });
  } catch (err) {
    console.error("[RANKS ERROR]", err);
    res.json({ success: false, error: err.stack || err.message });
  }
});

// POST /promote
app.post("/promote", async (req, res) => {
  try {
    const {
      username,
      requesterId,
      callerUsername,
      callerDisplayName,
      callerRank,
      playerList,
    } = req.body;
    if (!username || !requesterId)
      return res.json({
        success: false,
        error: "Missing username or requesterId.",
      });

    const cooldownResult = checkCooldown(requesterId);
    if (!cooldownResult.ok)
      return res.json({
        success: false,
        error: `Cooldown active. Try again in ${cooldownResult.remaining}s.`,
      });

    const { user, ambiguous, matches } = findUserInGame(username, playerList);
    if (ambiguous)
      return res.json({
        success: false,
        error: `Multiple players match "${username}":\n${matches.join(
          "\n"
        )}\nBe more specific.`,
      });
    if (!user)
      return res.json({
        success: false,
        error: `No in-game player found matching "${username}".`,
      });

    // Self-rank backend guard
    if (user.userId === requesterId)
      return res.json({
        success: false,
        error: "You cannot promote yourself.",
      });

    const ranks = await getRanks();
    const currentRank = await getUserRankInGroup(user.userId);
    if (currentRank === null)
      return res.json({
        success: false,
        error: `${user.username} is not in the group.`,
      });

    // Rank ceiling — cannot promote someone at or above caller's rank
    if (typeof callerRank === "number" && currentRank >= callerRank)
      return res.json({
        success: false,
        error: `You cannot promote someone at or above your own rank.`,
      });

    const sortedRanks = ranks
      .filter((r) => r.rank > 0 && r.rank < 255)
      .sort((a, b) => a.rank - b.rank);
    const currentIndex = sortedRanks.findIndex((r) => r.rank === currentRank);

    if (currentIndex === -1)
      return res.json({
        success: false,
        error: "Could not find user's rank in rank list.",
      });
    if (currentIndex >= sortedRanks.length - 1)
      return res.json({
        success: false,
        error: `${user.username} is already at the highest rank.`,
      });

    const newRank = sortedRanks[currentIndex + 1];

    // Rank ceiling — cannot promote someone to at or above caller's rank
    if (typeof callerRank === "number" && newRank.rank >= callerRank)
      return res.json({
        success: false,
        error: `You cannot promote someone to or above your own rank.`,
      });

    const oldRank = sortedRanks[currentIndex];
    await setUserRank(user.userId, newRank.id);
    setCooldown(requesterId);

    await sendWebhook(
      "promote",
      {
        username: callerUsername || "Unknown",
        displayName: callerDisplayName || "Unknown",
        userId: requesterId,
      },
      {
        username: user.username,
        displayName: user.displayName,
        userId: user.userId,
      },
      `**${oldRank.name}** → **${newRank.name}**`
    );

    res.json({
      success: true,
      message: `Promoted ${user.username} to ${newRank.name}.`,
    });
  } catch (err) {
    console.error("[PROMOTE ERROR]", err);
    res.json({ success: false, error: err.stack || err.message });
  }
});

// POST /demote
app.post("/demote", async (req, res) => {
  try {
    const {
      username,
      requesterId,
      callerUsername,
      callerDisplayName,
      callerRank,
      playerList,
    } = req.body;
    if (!username || !requesterId)
      return res.json({
        success: false,
        error: "Missing username or requesterId.",
      });

    const cooldownResult = checkCooldown(requesterId);
    if (!cooldownResult.ok)
      return res.json({
        success: false,
        error: `Cooldown active. Try again in ${cooldownResult.remaining}s.`,
      });

    const { user, ambiguous, matches } = findUserInGame(username, playerList);
    if (ambiguous)
      return res.json({
        success: false,
        error: `Multiple players match "${username}":\n${matches.join(
          "\n"
        )}\nBe more specific.`,
      });
    if (!user)
      return res.json({
        success: false,
        error: `No in-game player found matching "${username}".`,
      });

    // Self-rank backend guard
    if (user.userId === requesterId)
      return res.json({ success: false, error: "You cannot demote yourself." });

    const ranks = await getRanks();
    const currentRank = await getUserRankInGroup(user.userId);
    if (currentRank === null)
      return res.json({
        success: false,
        error: `${user.username} is not in the group.`,
      });

    // Rank ceiling — cannot demote someone at or above caller's rank
    if (typeof callerRank === "number" && currentRank >= callerRank)
      return res.json({
        success: false,
        error: `You cannot demote someone at or above your own rank.`,
      });

    const sortedRanks = ranks
      .filter((r) => r.rank > 0 && r.rank < 255)
      .sort((a, b) => a.rank - b.rank);
    const currentIndex = sortedRanks.findIndex((r) => r.rank === currentRank);

    if (currentIndex === -1)
      return res.json({
        success: false,
        error: "Could not find user's rank in rank list.",
      });
    if (currentIndex <= 0)
      return res.json({
        success: false,
        error: `${user.username} is already at the lowest rank.`,
      });

    const oldRank = sortedRanks[currentIndex];
    const newRank = sortedRanks[currentIndex - 1];
    await setUserRank(user.userId, newRank.id);
    setCooldown(requesterId);

    await sendWebhook(
      "demote",
      {
        username: callerUsername || "Unknown",
        displayName: callerDisplayName || "Unknown",
        userId: requesterId,
      },
      {
        username: user.username,
        displayName: user.displayName,
        userId: user.userId,
      },
      `**${oldRank.name}** → **${newRank.name}**`
    );

    res.json({
      success: true,
      message: `Demoted ${user.username} to ${newRank.name}.`,
    });
  } catch (err) {
    console.error("[DEMOTE ERROR]", err);
    res.json({ success: false, error: err.stack || err.message });
  }
});

// POST /setrank
app.post("/setrank", async (req, res) => {
  try {
    const {
      username,
      rankName,
      requesterId,
      callerUsername,
      callerDisplayName,
      callerRank,
      playerList,
    } = req.body;
    if (!username || !rankName || !requesterId)
      return res.json({
        success: false,
        error: "Missing username, rankName, or requesterId.",
      });

    const cooldownResult = checkCooldown(requesterId);
    if (!cooldownResult.ok)
      return res.json({
        success: false,
        error: `Cooldown active. Try again in ${cooldownResult.remaining}s.`,
      });

    const { user, ambiguous, matches } = findUserInGame(username, playerList);
    if (ambiguous)
      return res.json({
        success: false,
        error: `Multiple players match "${username}":\n${matches.join(
          "\n"
        )}\nBe more specific.`,
      });
    if (!user)
      return res.json({
        success: false,
        error: `No in-game player found matching "${username}".`,
      });

    // Self-rank backend guard
    if (user.userId === requesterId)
      return res.json({
        success: false,
        error: "You cannot setrank yourself.",
      });

    const ranks = await getRanks();
    const targetRank = ranks.find(
      (r) => r.name.toLowerCase() === rankName.toLowerCase()
    );
    if (!targetRank) {
      const available = ranks
        .filter((r) => r.rank > 0 && r.rank < 255)
        .map((r) => r.name)
        .join(", ");
      return res.json({
        success: false,
        error: `Rank "${rankName}" not found. Available: ${available}`,
      });
    }

    const currentRank = await getUserRankInGroup(user.userId);
    if (currentRank === null)
      return res.json({
        success: false,
        error: `${user.username} is not in the group.`,
      });

    // Rank ceiling — cannot target someone at or above caller's rank
    if (typeof callerRank === "number" && currentRank >= callerRank)
      return res.json({
        success: false,
        error: `You cannot setrank someone at or above your own rank.`,
      });

    // Rank ceiling — cannot set to at or above caller's rank
    if (typeof callerRank === "number" && targetRank.rank >= callerRank)
      return res.json({
        success: false,
        error: `You cannot set someone to a rank at or above your own.`,
      });

    if (currentRank === targetRank.rank)
      return res.json({
        success: false,
        error: `${user.username} is already at rank ${targetRank.name}.`,
      });

    const oldRankEntry = ranks.find((r) => r.rank === currentRank);
    await setUserRank(user.userId, targetRank.id);
    setCooldown(requesterId);

    await sendWebhook(
      "setrank",
      {
        username: callerUsername || "Unknown",
        displayName: callerDisplayName || "Unknown",
        userId: requesterId,
      },
      {
        username: user.username,
        displayName: user.displayName,
        userId: user.userId,
      },
      `**${oldRankEntry ? oldRankEntry.name : "Unknown"}** → **${
        targetRank.name
      }**`
    );

    res.json({
      success: true,
      message: `Set ${user.username}'s rank to ${targetRank.name}.`,
    });
  } catch (err) {
    console.error("[SETRANK ERROR]", err);
    res.json({ success: false, error: err.stack || err.message });
  }
});

app.listen(config.port, () => {
  console.log(`Roblox Ranker backend running on port ${config.port}`);
});
