// Always run fresh; never cache this route.
export const dynamic = "force-dynamic";

/* ---------------------------------------------------------------
   Rate limiting (inlined). Uses Upstash Redis REST when
   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set
   (durable across serverless instances); otherwise falls back to
   an in-memory store that resets on cold start.
----------------------------------------------------------------*/
const hasUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

async function upstash(command) {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Upstash error ${res.status}`);
  const json = await res.json();
  return json.result;
}

const mem = new Map();
const memCounters = new Map();

async function numberInCooldown(phone, cooldownMinutes) {
  const seconds = Math.max(1, cooldownMinutes) * 60;
  const key = `cooldown:${phone}`;
  if (hasUpstash) {
    const result = await upstash(["SET", key, "1", "NX", "EX", String(seconds)]);
    return result === null;
  }
  const now = Date.now();
  const exp = mem.get(key);
  if (exp && exp > now) return true;
  mem.set(key, now + seconds * 1000);
  return false;
}

async function ipOverDailyLimit(ip, dailyLimit) {
  const seconds = 24 * 60 * 60;
  const key = `ipcount:${ip}`;
  if (hasUpstash) {
    const count = await upstash(["INCR", key]);
    if (count === 1) await upstash(["EXPIRE", key, String(seconds)]);
    return count > dailyLimit;
  }
  const now = Date.now();
  const entry = memCounters.get(key);
  if (!entry || entry.expiresAtMs <= now) {
    memCounters.set(key, { count: 1, expiresAtMs: now + seconds * 1000 });
    return 1 > dailyLimit;
  }
  entry.count += 1;
  return entry.count > dailyLimit;
}

/* --------------------------------------------------------------- */

function toE164US(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function getClientIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const toNumber = toE164US(body.phone);
  if (!toNumber) {
    return Response.json(
      { error: "Please enter a valid 10-digit US phone number." },
      { status: 400 }
    );
  }

  const apiKey = process.env.RETELL_API_KEY;
  const fromNumber = process.env.RETELL_FROM_NUMBER;
  const agentId = process.env.RETELL_AGENT_ID;
  const cooldownMinutes = Number(process.env.DEMO_COOLDOWN_MINUTES || 10);
  const ipDailyLimit = Number(process.env.DEMO_IP_DAILY_LIMIT || 5);

  if (!apiKey || !fromNumber) {
    console.error("Missing RETELL_API_KEY or RETELL_FROM_NUMBER env vars.");
    return Response.json(
      { error: "Demo is temporarily unavailable. Please try again later." },
      { status: 500 }
    );
  }

  try {
    const ip = getClientIp(req);
    if (await ipOverDailyLimit(ip, ipDailyLimit)) {
      return Response.json(
        { error: "Daily demo limit reached. Please try again tomorrow." },
        { status: 429 }
      );
    }
    if (await numberInCooldown(toNumber, cooldownMinutes)) {
      return Response.json(
        {
          error: `We just called that number. Give it ${cooldownMinutes} minutes before requesting another demo.`,
        },
        { status: 429 }
      );
    }
  } catch (e) {
    console.error("Rate limit check failed (continuing):", e);
  }

  const payload = {
    from_number: fromNumber,
    to_number: toNumber,
    metadata: { source: "landing_page_demo" },
  };
  if (agentId) payload.override_agent_id = agentId;

  try {
    const retellRes = await fetch(
      "https://api.retellai.com/v2/create-phone-call",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!retellRes.ok) {
      const detail = await retellRes.text();
      console.error("Retell API error", retellRes.status, detail);
      return Response.json(
        { error: "Could not place the call right now. Please try again." },
        { status: 502 }
      );
    }

    const call = await retellRes.json();
    return Response.json({ ok: true, call_id: call.call_id });
  } catch (e) {
    console.error("Retell request failed:", e);
    return Response.json(
      { error: "Could not place the call right now. Please try again." },
      { status: 502 }
    );
  }
}
