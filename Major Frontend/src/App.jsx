import React, { useState, useEffect, useCallback } from "react";
import "./App.css";
import Header from "./components/Header";
import StatusPanel from "./components/StatusPanel";
import PatientInfo from "./components/PatientInfo";

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [conversationData, setConversationData] = useState(null);
  const [dbStatus, setDbStatus] = useState("idle");
  const [isPolling, setIsPolling] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [patientData, setPatientData] = useState({
    name: "",
    age: "",
    gender: "",
    contact: "",
    address: "",
    reason: "",
    preferredDoctor: "",
    medicalHistory: "",
    emergencyContact: "",
    appointmentPreference: "",
  });
  const [showElevenLabsWidget, setShowElevenLabsWidget] = useState(false);

  // Backend API base URL — set VITE_API_BASE_URL in .env for production
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
  const POLLING_INTERVAL = 2000; // ms

  // -------------------------------------------------------------------------
  // Load ElevenLabs ConvAI widget script once
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!document.querySelector('script[src*="elevenlabs"]')) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
      script.async = true;
      script.type = "text/javascript";
      document.body.appendChild(script);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Mount / unmount the ElevenLabs widget when the user starts a conversation
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!showElevenLabsWidget) {
      // Remove widget if user ended the conversation
      document.querySelectorAll("elevenlabs-convai").forEach((w) => w.remove());
      return;
    }

    const mountWidget = () => {
      if (document.querySelector("elevenlabs-convai")) return;

      const container = document.getElementById("elevenlabs-widget-container");
      if (!container) return;

      const widget = document.createElement("elevenlabs-convai");
      widget.setAttribute("agent-id", "agent_0201k9as34shfd5807dptt2fsvbb");

      // Keep widget positioned inside our container (not fixed/absolute)
      Object.assign(widget.style, {
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "450px",
        display: "block",
        bottom: "auto",
        left: "auto",
        right: "auto",
        top: "auto",
        transform: "none",
        zIndex: "1",
      });

      // Prevent the widget's internal styles from moving it out of the container
      const positionGuard = new MutationObserver(() => {
        if (widget.style.position === "fixed" || widget.style.position === "absolute") {
          widget.style.position = "relative";
          widget.style.bottom = "auto";
          widget.style.left = "auto";
          widget.style.right = "auto";
          widget.style.top = "auto";
          widget.style.transform = "none";
        }
      });
      positionGuard.observe(widget, { attributes: true, attributeFilter: ["style"] });

      container.innerHTML = "";
      container.appendChild(widget);
    };

    // Give the script a moment to register the custom element, then mount
    const timer = setTimeout(mountWidget, 150);
    return () => clearTimeout(timer);
  }, [showElevenLabsWidget]);

  // -------------------------------------------------------------------------
  // Parse incoming webhook payload → update patient state
  // -------------------------------------------------------------------------
  const handleWebhookData = useCallback((webhookPayload) => {
    const results = webhookPayload?.body?.data?.analysis?.data_collection_results;
    if (!results) return;

    setPatientData({
      name:                  results.Name?.value || "",
      age:                   results.Age?.value || "",
      gender:                results.Gender?.value || "",
      contact:               results.Contact?.value || "",
      address:               results["Address"]?.value || results["Address "]?.value || "",
      reason:                results.Reason?.value || "",
      preferredDoctor:       results["Preferred Doctor"]?.value || "",
      medicalHistory:        results["Previous Medical History"]?.value || "",
      emergencyContact:      results["Emergency Contact"]?.value || "",
      appointmentPreference: results["Appointment Preference"]?.value || "",
      conversationId:        webhookPayload.body.data.conversation_id,
      timestamp:             new Date().toISOString(),
      transcript:            webhookPayload.body.data.transcript,
      callDuration:          webhookPayload.body.data.metadata?.call_duration_secs,
    });

    setConversationData(webhookPayload.body.data);
    setIsConnected(true);
    setDbStatus("success");
    setTimeout(() => setDbStatus("idle"), 3000);
  }, []);

  // -------------------------------------------------------------------------
  // Real-time polling — active only when user clicks "Start Real-time"
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isPolling) return;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/get-latest-webhook`);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.timestamp && data.timestamp !== lastUpdate) {
          handleWebhookData(data);
          setLastUpdate(data.timestamp);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    const intervalId = setInterval(poll, POLLING_INTERVAL);
    return () => clearInterval(intervalId);
  }, [isPolling, lastUpdate, handleWebhookData, API_BASE_URL]);

  // -------------------------------------------------------------------------
  // Download all patient records from MongoDB as CSV
  // -------------------------------------------------------------------------
  const downloadPatientsData = async () => {
    try {
      setDbStatus("loading");
      const res = await fetch(`${API_BASE_URL}/api/patients?limit=1000`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data = await res.json();
      const patients = data.patients || [];

      if (patients.length === 0) {
        alert("No patient records found in the database.");
        setDbStatus("idle");
        return;
      }

      const headers = [
        "Name", "Age", "Gender", "Contact", "Address",
        "Reason for Visit", "Preferred Doctor", "Medical History",
        "Emergency Contact", "Appointment Preference",
        "Conversation ID", "Call Duration (secs)", "Created At", "Status",
      ];

      const rows = patients.map((p) =>
        [
          p.name, p.age, p.gender, p.contact, p.address,
          p.reason, p.preferredDoctor, p.medicalHistory,
          p.emergencyContact, p.appointmentPreference,
          p.conversationId, p.callDuration,
          p.createdAt ? new Date(p.createdAt).toLocaleString() : "",
          p.status,
        ].map((f) => `"${String(f ?? "").replace(/"/g, '""')}"`)
      );

      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `VocaCare_Patients_${new Date().toISOString().split("T")[0]}.csv`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      alert(`Downloaded ${patients.length} patient record(s).`);
      setDbStatus("success");
      setTimeout(() => setDbStatus("idle"), 2000);
    } catch (err) {
      console.error("Download error:", err);
      alert(`Failed to download: ${err.message}`);
      setDbStatus("error");
      setTimeout(() => setDbStatus("idle"), 2000);
    }
  };

  // -------------------------------------------------------------------------
  // Load sample data for offline/UI testing (does NOT hit the backend)
  // -------------------------------------------------------------------------
  const loadSampleData = () => {
    handleWebhookData({
      body: {
        data: {
          conversation_id: "conv_sample_" + Date.now(),
          analysis: {
            data_collection_results: {
              Name:                       { value: "Puneet Sankhla" },
              Age:                        { value: 22 },
              Gender:                     { value: "Male" },
              Contact:                    { value: "9589879629" },
              "Address":                  { value: "Indore, Madhya Pradesh" },
              Reason:                     { value: "Fever" },
              "Preferred Doctor":         { value: null },
              "Previous Medical History": { value: null },
              "Emergency Contact":        { value: "9589879629" },
              "Appointment Preference":   { value: "Tomorrow at 10 AM" },
            },
            transcript_summary:
              "Patient reports fever. Registration completed with appointment scheduled for tomorrow at 10 AM.",
          },
          transcript: [
            { role: "agent", message: "Hello! How can I help you today?" },
            { role: "user",  message: "I have a fever today." },
          ],
          metadata: { call_duration_secs: 293 },
        },
      },
      timestamp: Date.now(),
    });
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
      <div className="max-w-7xl mx-auto">

        <Header
          isPolling={isPolling}
          togglePolling={() => setIsPolling((v) => !v)}
          loadSampleData={loadSampleData}
          downloadPatientsData={downloadPatientsData}
          dbStatus={dbStatus}
        />

        <div className="mb-6">
          <StatusPanel
            isConnected={isConnected}
            isPolling={isPolling}
            lastUpdate={lastUpdate}
            conversationData={conversationData}
            patientInfo={patientData}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* ── Voice Agent ───────────────────────────────────────────── */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-purple-200 flex flex-col min-h-[700px] h-full">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2 flex-shrink-0">
                <span className="text-2xl">🎤</span>
                VocaCare Voice Agent
              </h2>

              {!showElevenLabsWidget ? (
                <div className="flex flex-col items-center justify-center flex-1 space-y-6">
                  <div className="text-center mb-6">
                    <div className="w-24 h-24 mx-auto mb-4 bg-purple-100 rounded-full flex items-center justify-center">
                      <span className="text-6xl">🎙️</span>
                    </div>
                    <p className="text-lg text-gray-700 font-medium mb-2">
                      Ready to start your registration?
                    </p>
                    <p className="text-sm text-gray-500">
                      Click below to connect with our AI voice assistant
                    </p>
                  </div>
                  <button
                    onClick={() => setShowElevenLabsWidget(true)}
                    className="px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl hover:from-purple-600 hover:to-pink-700 transition-all font-semibold text-lg flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    <span className="text-2xl">🎤</span>
                    Start Conversation
                  </button>
                </div>
              ) : (
                <div className="relative flex flex-col h-full min-h-[550px]">
                  <div className="mb-3 p-3 bg-purple-50 border-2 border-purple-200 rounded-lg flex-shrink-0">
                    <p className="text-sm text-purple-700 font-medium text-center">
                      🎙️ Speak clearly — the AI will guide you through registration
                    </p>
                  </div>

                  <div
                    id="elevenlabs-widget-container"
                    className="w-full flex-1 flex items-stretch justify-stretch min-h-[450px] bg-gray-50 rounded-lg overflow-hidden"
                  >
                    <div className="text-center text-gray-400 m-auto">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-2" />
                      <p className="text-sm">Loading voice agent...</p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setShowElevenLabsWidget(false);
                    }}
                    className="mt-3 px-6 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all font-semibold flex items-center justify-center gap-2 w-full shadow-lg flex-shrink-0"
                  >
                    <span className="text-xl">📞</span>
                    End Conversation
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Patient Information ───────────────────────────────────── */}
          <div className="lg:col-span-1">
            <PatientInfo
              patientInfo={patientData}
              conversationData={conversationData}
            />
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
