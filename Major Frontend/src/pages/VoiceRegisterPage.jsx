/**
 * VoiceRegisterPage — PUBLIC page.
 * Hosts the ElevenLabs voice widget with no auth required.
 * After the call ends, shows a credential card via WebSocket.
 */
import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Mic, MicOff, ArrowLeft, Copy, CheckCircle, KeyRound, User } from "lucide-react";
import { useWebSocket } from "../hooks/useWebSocket";

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID || "agent_0201k9as34shfd5807dptt2fsvbb";

export default function VoiceRegisterPage() {
  const [showWidget,    setShowWidget]    = useState(false);
  const [credentials,   setCredentials]   = useState(null);
  const [copied,        setCopied]        = useState({ email: false, pass: false });
  const { latestPatient, wsConnected }    = useWebSocket();

  // ── ElevenLabs SDK ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!document.querySelector('script[src*="elevenlabs"]')) {
      const s = document.createElement("script");
      s.src   = "https://unpkg.com/@elevenlabs/convai-widget-embed";
      s.async = true;
      s.type  = "text/javascript";
      document.body.appendChild(s);
    }
  }, []);

  // ── Mount widget ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showWidget) {
      document.querySelectorAll("elevenlabs-convai").forEach((w) => w.remove());
      return;
    }
    const mount = () => {
      if (document.querySelector("elevenlabs-convai")) return;
      const container = document.getElementById("vr-widget-container");
      if (!container) return;

      const widget = document.createElement("elevenlabs-convai");
      widget.setAttribute("agent-id", AGENT_ID);
      Object.assign(widget.style, {
        position: "relative", width: "100%", height: "100%",
        minHeight: "420px", display: "block",
        bottom: "auto", left: "auto", right: "auto", top: "auto",
        transform: "none", zIndex: "1",
      });

      const guard = new MutationObserver(() => {
        if (["fixed","absolute"].includes(widget.style.position)) {
          Object.assign(widget.style, { position:"relative", bottom:"auto", left:"auto", right:"auto", top:"auto", transform:"none" });
        }
      });
      guard.observe(widget, { attributes: true, attributeFilter: ["style"] });
      container.innerHTML = "";
      container.appendChild(widget);
    };
    const t = setTimeout(mount, 150);
    return () => clearTimeout(t);
  }, [showWidget]);

  // ── Receive credentials via WebSocket after call ends ──────────────────
  useEffect(() => {
    if (!latestPatient) return;
    // Build credential from patient name + contact (mirrors backend logic)
    const name    = String(latestPatient.name || "patient").toLowerCase().replace(/\s+/g, "");
    const contact = String(latestPatient.contact || "");
    const last4   = contact.length >= 4 ? contact.slice(-4) : contact;
    const email   = `${name}.${last4}@patient.vocare`;
    const pass    = contact || "VocaCare@Patient";
    setCredentials({ email, password: pass, name: latestPatient.name });
    setShowWidget(false);
  }, [latestPatient]);

  const copyToClipboard = async (text, key) => {
    await navigator.clipboard.writeText(text);
    setCopied((c) => ({ ...c, [key]: true }));
    setTimeout(() => setCopied((c) => ({ ...c, [key]: false })), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex flex-col">
      {/* Top bar */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-white/10">
        <Link to="/" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm">
          <ArrowLeft size={16} /> Back to Home
        </Link>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-400 animate-pulse" : "bg-slate-600"}`} />
          <span className="text-xs text-slate-400">{wsConnected ? "Live" : "Connecting…"}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl">

          {/* ── Credential Card (post-call) ──────────────────────────────── */}
          {credentials ? (
            <div className="animate-float">
              <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-8 py-6 text-center">
                  <CheckCircle size={48} className="text-white mx-auto mb-3" />
                  <h2 className="text-2xl font-black text-white">Registration Complete!</h2>
                  <p className="text-emerald-100 mt-1">Welcome, {credentials.name}. Note down your login credentials.</p>
                </div>

                {/* Credentials */}
                <div className="p-8 space-y-4">
                  {/* Username */}
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                      <User size={12} /> Your Username (Email)
                    </label>
                    <div className="flex items-center gap-2 bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3">
                      <span className="flex-1 font-mono text-slate-800 text-sm font-semibold">{credentials.email}</span>
                      <button onClick={() => copyToClipboard(credentials.email, "email")}
                        className="text-slate-400 hover:text-indigo-600 transition-colors">
                        {copied.email ? <CheckCircle size={18} className="text-green-500" /> : <Copy size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                      <KeyRound size={12} /> Your Temporary Password
                    </label>
                    <div className="flex items-center gap-2 bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3">
                      <span className="flex-1 font-mono text-slate-800 text-sm font-semibold">{credentials.password}</span>
                      <button onClick={() => copyToClipboard(credentials.password, "pass")}
                        className="text-slate-400 hover:text-indigo-600 transition-colors">
                        {copied.pass ? <CheckCircle size={18} className="text-green-500" /> : <Copy size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Warning */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-amber-800 text-sm font-semibold mb-1">⚠️ Important</p>
                    <ul className="text-amber-700 text-sm space-y-1 list-disc list-inside">
                      <li>Write down or copy these credentials now</li>
                      <li>You will be asked to change your password on first login</li>
                      <li>Your username is auto-generated from your name and phone number</li>
                    </ul>
                  </div>

                  <Link to="/login"
                    className="block w-full text-center py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold text-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/30">
                    → Log In Now
                  </Link>
                </div>
              </div>
            </div>

          ) : !showWidget ? (
            /* ── Pre-call screen ─────────────────────────────────────────── */
            <div className="text-center">
              {/* Animated mic */}
              <div className="relative w-44 h-44 mx-auto mb-10">
                <div className="absolute inset-0 bg-cyan-500/20 rounded-full animate-ping" style={{ animationDuration: "2s" }} />
                <div className="absolute inset-4 bg-cyan-500/10 rounded-full animate-ping" style={{ animationDuration: "2s", animationDelay: "0.5s" }} />
                <div className="relative w-full h-full bg-gradient-to-br from-cyan-500 to-indigo-600 rounded-full flex items-center justify-center shadow-2xl shadow-cyan-500/40">
                  <Mic size={64} className="text-white" />
                </div>
              </div>

              <h1 className="text-4xl font-black text-white mb-4">Register via Voice</h1>
              <p className="text-slate-400 text-lg mb-3 max-w-md mx-auto">
                Click below and speak with our AI assistant. It will collect your details and create your account automatically.
              </p>
              <p className="text-slate-500 text-sm mb-10">No forms. No typing. Just speak naturally.</p>

              <button
                onClick={() => setShowWidget(true)}
                className="px-10 py-5 bg-gradient-to-r from-cyan-500 to-indigo-600 text-white rounded-2xl font-black text-xl flex items-center gap-3 mx-auto shadow-2xl shadow-cyan-500/40 hover:from-cyan-600 hover:to-indigo-700 transition-all hover:-translate-y-1"
              >
                <Mic size={26} />
                Start Voice Registration
              </button>

              <p className="text-slate-500 text-sm mt-8">
                Already registered?{" "}
                <Link to="/login" className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors">Sign In</Link>
              </p>
            </div>

          ) : (
            /* ── Active call ─────────────────────────────────────────────── */
            <div>
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">Voice Registration Active</h2>
                <p className="text-slate-400 text-sm">Speak clearly. The AI will guide you.</p>
              </div>

              <div className="bg-white/5 border border-white/10 backdrop-blur rounded-2xl overflow-hidden">
                <div className="bg-indigo-500/10 border-b border-white/10 px-4 py-3 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm text-slate-300 font-medium">Recording in progress…</span>
                </div>
                <div
                  id="vr-widget-container"
                  className="w-full min-h-[420px] flex items-center justify-center"
                >
                  <div className="text-center text-slate-500">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500 mx-auto mb-3" />
                    <p className="text-sm">Connecting to AI agent…</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowWidget(false)}
                className="mt-4 w-full py-4 bg-red-500/90 hover:bg-red-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <MicOff size={18} /> End Call
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
