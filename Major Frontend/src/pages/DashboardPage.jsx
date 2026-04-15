import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { patientApi } from "../services/api";
import DashboardHeader from "../components/DashboardHeader";
import StatusPanel from "../components/StatusPanel";
import PatientInfo from "../components/PatientInfo";

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID || "agent_0201k9as34shfd5807dptt2fsvbb";

export default function DashboardPage() {
  const { user }                      = useAuth();
  const navigate                      = useNavigate();
  const { latestPatient, wsConnected } = useWebSocket();

  const [patientData,         setPatientData]         = useState(null);
  const [conversationData,    setConversationData]     = useState(null);
  const [showWidget,          setShowWidget]           = useState(false);
  const [dbStatus,            setDbStatus]             = useState("idle");
  const [recentPatients,      setRecentPatients]       = useState([]);
  const [showRecentPatients,  setShowRecentPatients]   = useState(false);

  // ── Load ElevenLabs SDK once ────────────────────────────────────────────
  useEffect(() => {
    if (!document.querySelector('script[src*="elevenlabs"]')) {
      const s = document.createElement("script");
      s.src   = "https://unpkg.com/@elevenlabs/convai-widget-embed";
      s.async = true;
      s.type  = "text/javascript";
      document.body.appendChild(s);
    }
  }, []);

  // ── Mount / unmount ElevenLabs widget ──────────────────────────────────
  useEffect(() => {
    if (!showWidget) {
      document.querySelectorAll("elevenlabs-convai").forEach((w) => w.remove());
      return;
    }
    const mount = () => {
      if (document.querySelector("elevenlabs-convai")) return;
      const container = document.getElementById("el-widget-container");
      if (!container) return;

      const widget = document.createElement("elevenlabs-convai");
      widget.setAttribute("agent-id", AGENT_ID);
      Object.assign(widget.style, {
        position: "relative", width: "100%", height: "100%",
        minHeight: "450px", display: "block",
        bottom: "auto", left: "auto", right: "auto", top: "auto",
        transform: "none", zIndex: "1",
      });

      // Prevent the widget from escaping its container
      const guard = new MutationObserver(() => {
        if (["fixed", "absolute"].includes(widget.style.position)) {
          Object.assign(widget.style, {
            position: "relative", bottom: "auto", left: "auto",
            right: "auto", top: "auto", transform: "none",
          });
        }
      });
      guard.observe(widget, { attributes: true, attributeFilter: ["style"] });

      container.innerHTML = "";
      container.appendChild(widget);
    };
    const t = setTimeout(mount, 150);
    return () => clearTimeout(t);
  }, [showWidget]);

  // ── React to WebSocket push ─────────────────────────────────────────────
  useEffect(() => {
    if (!latestPatient) return;

    setPatientData(latestPatient);
    setConversationData({ transcript: latestPatient.transcript, transcriptSummary: latestPatient.transcriptSummary });
    setDbStatus("success");
    setTimeout(() => setDbStatus("idle"), 3000);
  }, [latestPatient]);

  // ── Download CSV (admin only) ───────────────────────────────────────────
  const downloadPatientsData = async () => {
    try {
      setDbStatus("loading");
      const data     = await patientApi.list(1000);
      const patients = data.patients || [];
      if (!patients.length) { alert("No records found."); setDbStatus("idle"); return; }

      const headers = [
        "Name","Age","Gender","Contact","Address","Reason","Preferred Doctor",
        "Medical History","Emergency Contact","Appointment Preference",
        "Conversation ID","Duration (s)","Created At","Status",
      ];
      const rows = patients.map((p) =>
        [
          p.name, p.age, p.gender, p.contact, p.address, p.reason,
          p.preferredDoctor, p.medicalHistory, p.emergencyContact,
          p.appointmentPreference, p.conversationId, p.callDuration,
          p.createdAt ? new Date(p.createdAt).toLocaleString() : "", p.status,
        ].map((f) => `"${String(f ?? "").replace(/"/g, '""')}"`)
      );

      const csv  = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement("a"), {
        href: url, download: `VocaCare_Patients_${new Date().toISOString().slice(0, 10)}.csv`,
        style: "display:none",
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setDbStatus("success");
      setTimeout(() => setDbStatus("idle"), 2000);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
      setDbStatus("error");
      setTimeout(() => setDbStatus("idle"), 2000);
    }
  };

  // ── Load sample data ────────────────────────────────────────────────────
  const loadSampleData = () => {
    const sample = {
      conversationId:        "conv_sample_" + Date.now(),
      name:                  "Puneet Sankhla",
      age:                   22,
      gender:                "Male",
      contact:               "9589879629",
      address:               "Indore, Madhya Pradesh",
      reason:                "Fever",
      preferredDoctor:       "Dr. Sharma",
      medicalHistory:        null,
      emergencyContact:      "9589879629",
      appointmentPreference: "Tomorrow at 10 AM",
      transcriptSummary:     "Patient has fever. Appointment set for tomorrow at 10 AM.",
      transcript:            [
        { role: "agent", message: "Hello! How can I help you today?" },
        { role: "user",  message: "I have a fever and would like to register." },
      ],
      callDuration: 293,
      createdAt:    new Date().toISOString(),
    };
    setPatientData(sample);
    setConversationData({ transcript: sample.transcript, transcriptSummary: sample.transcriptSummary });
    setDbStatus("success");
    setTimeout(() => setDbStatus("idle"), 2000);
  };

  // ── Fetch recent patients for admin table ───────────────────────────────
  const fetchRecentPatients = useCallback(async () => {
    if (user?.role !== "admin") return;
    try {
      const data = await patientApi.list(10);
      setRecentPatients(data.patients || []);
      setShowRecentPatients(true);
    } catch { /* ignore */ }
  }, [user]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/30 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">

        <DashboardHeader
          loadSampleData={loadSampleData}
          downloadPatientsData={downloadPatientsData}
          dbStatus={dbStatus}
        />

        {/* Status */}
        <div className="mb-6">
          <StatusPanel
            wsConnected={wsConnected}
            lastPatient={patientData}
            conversationData={conversationData}
            patientInfo={patientData}
          />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

          {/* ── Voice Agent ─────────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-purple-100 flex flex-col min-h-[700px]">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2 flex-shrink-0">
              <span className="text-2xl">🎤</span> VocaCare Voice Agent
            </h2>

            {!showWidget ? (
              <div className="flex flex-col items-center justify-center flex-1 space-y-6">
                <div className="text-center">
                  <div className="w-28 h-28 mx-auto mb-5 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-6xl">🎙️</span>
                  </div>
                  <p className="text-lg text-gray-700 font-semibold mb-2">Ready to register a patient?</p>
                  <p className="text-sm text-gray-500">Click below to start the AI voice session</p>
                </div>

                <button
                  onClick={() => setShowWidget(true)}
                  className="px-8 py-4 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-bold text-lg flex items-center gap-3 shadow-lg shadow-purple-500/30 hover:from-purple-600 hover:to-indigo-700 transition-all hover:-translate-y-0.5"
                >
                  <span className="text-2xl">🎤</span> Start Conversation
                </button>

                {wsConnected && (
                  <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    Dashboard will update automatically when the call ends
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col h-full min-h-[550px]">
                <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg flex-shrink-0">
                  <p className="text-sm text-purple-700 font-medium text-center">
                    🎙️ Speak clearly — the AI will guide the patient through registration
                  </p>
                </div>
                <div
                  id="el-widget-container"
                  className="w-full flex-1 min-h-[450px] bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center"
                >
                  <div className="text-center text-gray-400">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mx-auto mb-2" />
                    <p className="text-sm">Loading voice agent…</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowWidget(false)}
                  className="mt-3 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 w-full flex-shrink-0 transition-colors"
                >
                  <span className="text-lg">📞</span> End Conversation
                </button>
              </div>
            )}
          </div>

          {/* ── Patient Info ─────────────────────────────────────── */}
          <div>
            <PatientInfo
              patientInfo={patientData || {}}
              conversationData={conversationData}
            />
          </div>
        </div>

        {/* ── Admin: Recent Patients Table ──────────────────────── */}
        {user?.role === "admin" && (
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">Recent Patients</h3>
              <button
                onClick={fetchRecentPatients}
                className="px-4 py-2 text-sm font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                {showRecentPatients ? "Refresh" : "Load Records"}
              </button>
            </div>

            {showRecentPatients && recentPatients.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {["Name","Age","Contact","Reason","Appointment","Status","Date"].map((h) => (
                        <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentPatients.map((p, i) => (
                      <tr key={p._id || i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-gray-800">{p.name || "—"}</td>
                        <td className="py-2.5 px-3 text-gray-600">{p.age || "—"}</td>
                        <td className="py-2.5 px-3 text-gray-600">{p.contact || "—"}</td>
                        <td className="py-2.5 px-3 text-gray-600 max-w-xs truncate">{p.reason || "—"}</td>
                        <td className="py-2.5 px-3 text-gray-600 max-w-xs truncate">{p.appointmentPreference || "—"}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                            {p.status || "completed"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-gray-400 text-xs">
                          {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : showRecentPatients ? (
              <p className="text-gray-400 text-sm text-center py-8">No patient records yet.</p>
            ) : (
              <p className="text-gray-400 text-sm text-center py-8">Click "Load Records" to view recent patient registrations.</p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
