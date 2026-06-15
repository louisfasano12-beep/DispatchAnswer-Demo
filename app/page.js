"use client";

import { useState } from "react";

export default function Home() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // { type: "ok"|"err", msg }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      const res = await fetch("/api/demo-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({
          type: "err",
          msg: data.error || "Something went wrong. Please try again.",
        });
      } else {
        setStatus({
          type: "ok",
          msg: "On its way! Your phone should ring in a few seconds. Pick up and talk to DispatchAnswer like you're a customer calling after hours.",
        });
        setPhone("");
      }
    } catch (err) {
      setStatus({
        type: "err",
        msg: "Could not reach the server. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap">
      <nav className="nav">
        <div className="logo">
          Dispatch<span>Answer</span>
        </div>
        <div className="nav-tag">AI answering for HVAC contractors</div>
      </nav>

      <section className="hero">
        <div>
          <span className="eyebrow">Live demo · rings your phone</span>
          <h1>Never miss another after-hours call.</h1>
          <p className="sub">
            DispatchAnswer picks up 24/7, sounds human, and books the job — so
            you stop losing customers to voicemail.
          </p>
          <ul className="bullets">
            <li>Answers every call, day or night</li>
            <li>Captures the lead and books the appointment</li>
            <li>Texts you the details instantly</li>
            <li>Pay per booking — no monthly fee</li>
          </ul>
        </div>

        <div className="card">
          <h2>Hear it for yourself</h2>
          <p className="small">
            Enter your number and our AI agent will call you right now.
          </p>
          <form onSubmit={handleSubmit}>
            <label htmlFor="phone">Your phone number</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <button className="cta" type="submit" disabled={loading}>
              {loading ? "Calling you…" : "Call me now →"}
            </button>
          </form>

          {status && (
            <div className={`status show ${status.type}`}>{status.msg}</div>
          )}

          <p className="consent">
            By submitting, you agree to receive a one-time automated demo call.
            US numbers only. Standard rates may apply.
          </p>
        </div>
      </section>

      <footer className="foot">
        © {new Date().getFullYear()} DispatchAnswer. Built for contractors who
        answer with their hands full.
      </footer>
    </main>
  );
}
