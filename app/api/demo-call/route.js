export const dynamic = "force-dynamic";

const mem = new Map();
const memCounters = new Map();

function numberInCooldown(phone, minutes) {
  const now = Date.now();
  const exp = mem.get(phone);
  if (exp && exp > now) return true;
  mem.set(phone, now + Math.max(1, minutes) * 60000);
  return false;
}

function ipOverDailyLimit(ip, limit) {
  const now = Date.now();
  const e = memCounters.get(ip);
  if (!e || e.exp <= now) {
    memCounters.set(ip, { count: 1, exp: now + 86400000 });
    return 1 > limit;
  }
  e.count += 1;
  return e.count > limit;
}

function toE164US(raw) {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  return null;
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const to = toE164US(body.phone);
  if (!to) {
    return Response.json(
      { error: "Please enter a valid 10-digit US phone number." },
      { status: 400 }
    );
  }

  const apiKey = process.env.RETELL_API_KEY || process.env.Retell_API_KEY;
  const fromNumber = process.env.RETELL_FROM_NUMBER;
  const agentId = process.env.RETELL_AGENT_ID;
  const cooldown = Number(process.env.DEMO_COOLDOWN_MINUTES || 10);
  const ipLimit = Number(process.env.DEMO_IP_DAILY_LIMIT || 5);

  if (!apiKey || !fromNumber) {
    return Response.json(
      { error: "Demo is temporarily unavailable. Please try again later." },
      { status: 500 }
    );
  }

  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : "unknown";
  if (ipOverDailyLimit(ip, ipLimit)) {
    return Response.json(
      { error: "Daily demo limit reached. Please try again tomorrow." },
      { status: 429 }
    );
  }
  if (numberInCooldown(to, cooldown)) {
    return Response.json(
      { error: "We just called that number. Give it a few minutes before requesting another demo." },
      { status: 429 }
    );
  }

  const payload = {
    from_number: fromNumber,
    to_number: to,
    metadata: { source: "landing_page_demo" },
  };
  if (agentId) payload.override_agent_id = agentId;

  try {
    const r = await fetch("https://api.retellai.com/v2/create-phone-call", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      console.error("Retell error", r.status, await r.text());
      return Response.json(
        { error: "Could not place the call right now. Please try again." },
        { status: 502 }
      );
    }
    const call = await r.json();
    return Response.json({ ok: true, call_id: call.call_id });
  } catch (e) {
    console.error("Retell request failed:", e);
    return Response.json(
      { error: "Could not place the call right now. Please try again." },
      { status: 502 }
    );
  }
}
