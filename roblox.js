import config from "./config.js";

const BASE_URL       = "https://groups.roblox.com";
const OPEN_CLOUD_URL = "https://apis.roblox.com";

// Fetch all roles/ranks in the group
export async function getRanks() {
  const res = await fetch(`${BASE_URL}/v1/groups/${config.groupId}/roles`);
  if (!res.ok)
    throw new Error(`Failed to fetch ranks: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.roles.map((r) => ({
    id: r.id,
    name: r.name,
    rank: r.rank,
  }));
}

// Match a typed name against the in-game player list sent from Roblox
// playerList: [{ userId, username, displayName }]
// Returns: { user, ambiguous, matches }
export function findUserInGame(partialName, playerList) {
  const trimmed = (partialName || "").trim();
  if (!trimmed || !Array.isArray(playerList) || playerList.length === 0)
    return { user: null, ambiguous: false, matches: [] };

  const lower = trimmed.toLowerCase();

  // 1. Exact username match
  const exactUsername = playerList.find(p => p.username.toLowerCase() === lower);
  if (exactUsername) return { user: exactUsername, ambiguous: false, matches: [] };

  // 2. Exact display name match
  const exactDisplay = playerList.find(p => p.displayName.toLowerCase() === lower);
  if (exactDisplay) return { user: exactDisplay, ambiguous: false, matches: [] };

  // 3. Partial matches — username starts with typed name
  const partialUsername = playerList.filter(p => p.username.toLowerCase().startsWith(lower));
  if (partialUsername.length === 1) return { user: partialUsername[0], ambiguous: false, matches: [] };
  if (partialUsername.length > 1) {
    return {
      user: null,
      ambiguous: true,
      matches: partialUsername.slice(0, 5).map(p => `${p.displayName} (@${p.username})`),
    };
  }

  // 4. Partial matches — display name starts with typed name
  const partialDisplay = playerList.filter(p => p.displayName.toLowerCase().startsWith(lower));
  if (partialDisplay.length === 1) return { user: partialDisplay[0], ambiguous: false, matches: [] };
  if (partialDisplay.length > 1) {
    return {
      user: null,
      ambiguous: true,
      matches: partialDisplay.slice(0, 5).map(p => `${p.displayName} (@${p.username})`),
    };
  }

  // 5. Partial matches — username contains typed name
  const containsUsername = playerList.filter(p => p.username.toLowerCase().includes(lower));
  if (containsUsername.length === 1) return { user: containsUsername[0], ambiguous: false, matches: [] };
  if (containsUsername.length > 1) {
    return {
      user: null,
      ambiguous: true,
      matches: containsUsername.slice(0, 5).map(p => `${p.displayName} (@${p.username})`),
    };
  }

  // 6. Partial matches — display name contains typed name
  const containsDisplay = playerList.filter(p => p.displayName.toLowerCase().includes(lower));
  if (containsDisplay.length === 1) return { user: containsDisplay[0], ambiguous: false, matches: [] };
  if (containsDisplay.length > 1) {
    return {
      user: null,
      ambiguous: true,
      matches: containsDisplay.slice(0, 5).map(p => `${p.displayName} (@${p.username})`),
    };
  }

  return { user: null, ambiguous: false, matches: [] };
}

// Get user's current rank number in the group
export async function getUserRankInGroup(userId) {
  const res = await fetch(`${BASE_URL}/v1/users/${userId}/groups/roles`);
  if (!res.ok)
    throw new Error(`Failed to fetch user group roles: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const groupEntry = data.data?.find((g) => g.group.id === config.groupId);
  if (!groupEntry) return null;
  return groupEntry.role.rank;
}

// Set a user's rank via Open Cloud API
export async function setUserRank(userId, rolesetId) {
  const res = await fetch(
    `${OPEN_CLOUD_URL}/cloud/v2/groups/${config.groupId}/memberships/${userId}`,
    {
      method: "PATCH",
      headers: {
        "x-api-key": config.robloxApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: `groups/${config.groupId}/roles/${rolesetId}`,
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to set rank: ${res.status} ${res.statusText} — ${errText}`);
  }
  return true;
}
