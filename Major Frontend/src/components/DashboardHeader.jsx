/**
 * DashboardHeader — top bar for the protected dashboard.
 * Shows user info, role badge, and action buttons.
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Download, FlaskConical, Stethoscope } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const ROLE_STYLES = {
  admin:   "bg-red-100 text-red-700 border-red-200",
  doctor:  "bg-blue-100 text-blue-700 border-blue-200",
  patient: "bg-green-100 text-green-700 border-green-200",
};

export default function DashboardHeader({ loadSampleData, downloadPatientsData, dbStatus }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="bg-white rounded-xl shadow-lg px-6 py-4 mb-6 border border-gray-100">
      <div className="flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Stethoscope size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              VocaCare
            </h1>
            <p className="text-xs text-gray-500">AI Patient Registration</p>
          </div>
        </div>

        {/* Actions + User */}
        <div className="flex items-center gap-3">
          {/* DB status indicator */}
          {dbStatus !== "idle" && (
            <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${
              dbStatus === "success" ? "bg-green-100 text-green-700" :
              dbStatus === "error"   ? "bg-red-100 text-red-700"   :
                                       "bg-blue-100 text-blue-700"
            }`}>
              {dbStatus === "loading" ? "Loading…" :
               dbStatus === "success" ? "✓ Success"  : "✗ Failed"}
            </span>
          )}

          {/* Admin-only: sample data + download */}
          {user?.role === "admin" && (
            <>
              <button
                onClick={loadSampleData}
                className="px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors font-medium text-sm flex items-center gap-1.5"
              >
                <FlaskConical size={15} />
                Test Data
              </button>
              <button
                onClick={downloadPatientsData}
                className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors font-medium text-sm flex items-center gap-1.5"
              >
                <Download size={15} />
                Export CSV
              </button>
            </>
          )}

          {/* User info */}
          <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
              {user?.full_name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-gray-800 leading-none">{user?.full_name}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded border font-medium mt-0.5 inline-block ${ROLE_STYLES[user?.role] || "bg-gray-100 text-gray-600"}`}>
                {user?.role}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
