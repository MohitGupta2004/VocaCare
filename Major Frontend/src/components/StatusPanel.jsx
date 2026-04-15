/**
 * StatusPanel — shows live WebSocket + database status badges.
 * Replaces the old polling-based status panel.
 */
import React from "react";
import { Wifi, WifiOff, Database, Clock, Activity } from "lucide-react";

export default function StatusPanel({
  wsConnected,
  lastPatient,
  conversationData,
  patientInfo,
}) {
  const formatTime = (iso) => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleTimeString(); } catch { return null; }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-5 border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Activity size={20} className="text-indigo-600" />
          System Status
        </h2>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* WebSocket */}
        <div className={`p-4 rounded-lg border ${wsConnected ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">Real-time</span>
            {wsConnected
              ? <Wifi size={16} className="text-green-600" />
              : <WifiOff size={16} className="text-gray-400" />}
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${wsConnected ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            <span className={`text-xs font-medium ${wsConnected ? "text-green-700" : "text-gray-500"}`}>
              {wsConnected ? "WebSocket Live" : "Connecting…"}
            </span>
          </div>
        </div>

        {/* Database */}
        <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
          <div className="flex items-center gap-2 mb-2">
            <Database size={16} className="text-blue-600" />
            <span className="text-sm font-semibold text-gray-700">Database</span>
          </div>
          <p className="text-xs text-gray-600">medical_records</p>
          <p className="text-xs text-green-600 font-medium mt-1">✅ Auto-save on</p>
        </div>

        {/* Last update */}
        <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-100">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-purple-600" />
            <span className="text-sm font-semibold text-gray-700">Last Update</span>
          </div>
          {lastPatient?.createdAt
            ? <p className="text-xs text-purple-700 font-medium">{formatTime(lastPatient.createdAt) || "—"}</p>
            : <p className="text-xs text-gray-400">No data yet</p>}
        </div>

        {/* Call stats */}
        <div className="p-4 bg-gradient-to-br from-yellow-50 to-orange-50 rounded-lg border border-yellow-100">
          <div className="text-sm font-semibold text-gray-700 mb-2">Call Stats</div>
          {conversationData ? (
            <>
              <p className="text-xs text-gray-600">Duration: {patientInfo?.callDuration || 0}s</p>
              <p className="text-xs text-gray-600">Turns: {conversationData.transcript?.length || 0}</p>
            </>
          ) : (
            <p className="text-xs text-gray-400">No active call</p>
          )}
        </div>
      </div>
    </div>
  );
}
