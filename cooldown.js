const COOLDOWN_SECONDS = 60;
const cooldowns = new Map(); // requesterId -> timestamp (ms)

// Returns { ok: true } if no cooldown, or { ok: false, remaining: seconds } if on cooldown
export function checkCooldown(requesterId) {
  const key = String(requesterId);
  const now = Date.now();
  const lastUsed = cooldowns.get(key);

  if (!lastUsed) return { ok: true };

  const elapsed = (now - lastUsed) / 1000;
  if (elapsed >= COOLDOWN_SECONDS) return { ok: true };

  return {
    ok: false,
    remaining: Math.ceil(COOLDOWN_SECONDS - elapsed),
  };
}

// Sets the cooldown timestamp for a requester
export function setCooldown(requesterId) {
  cooldowns.set(String(requesterId), Date.now());
}
