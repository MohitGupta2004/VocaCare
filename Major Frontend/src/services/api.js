/**
 * api.js — Centralised fetch wrapper.
 * Automatically attaches JWT Bearer token from localStorage.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem("vocare_token");
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  };
  const response = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail || `Request failed: ${response.status}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const authApi = {
  login:          (email, password) =>
    apiFetch("/auth/login", { method: "POST", body: { email, password } }),
  doctorSignup:   (data) =>
    apiFetch("/auth/signup/doctor", { method: "POST", body: data }),
  me:             () => apiFetch("/auth/me"),
  changePassword: (old_password, new_password) =>
    apiFetch("/auth/change-password", { method: "POST", body: { old_password, new_password } }),
};

// ---------------------------------------------------------------------------
// Patient (own record)
// ---------------------------------------------------------------------------
export const patientApi = {
  myRecord: () => apiFetch("/api/my-record"),
  stats:    () => apiFetch("/api/stats"),
  // Keep generic list for legacy compat
  list:     (limit = 50) => apiFetch(`/api/patients?limit=${limit}`),
};

// ---------------------------------------------------------------------------
// Doctor
// ---------------------------------------------------------------------------
export const doctorApi = {
  myPatients:   ()           => apiFetch("/doctor/patients"),
  getPatient:   (id)         => apiFetch(`/doctor/patient/${id}`),
  addPrescription: (data)    => apiFetch("/doctor/prescription",   { method: "POST", body: data }),
  updateStatus:    (data)    => apiFetch("/doctor/patient-status", { method: "PUT",  body: data }),
  addReport:       (data)    => apiFetch("/doctor/report",         { method: "PUT",  body: data }),
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export const adminApi = {
  allPatients:  (limit = 100) => apiFetch(`/admin/patients?limit=${limit}`),
  pendingCases: ()             => apiFetch("/admin/pending-cases"),
  allDoctors:   ()             => apiFetch("/admin/doctors"),
  stats:        ()             => apiFetch("/admin/stats"),
  assignDoctor: (patient_id, doctor_id) =>
    apiFetch(`/admin/patient/${patient_id}/assign-doctor`, {
      method: "PUT", body: { patient_id, doctor_id },
    }),
};

export default apiFetch;
