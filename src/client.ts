/**
 * Client Booking Application
 *
 * Serves the TimePilot client-facing booking SPA on the configured client port.
 * The app is a self-contained HTML/CSS/JS document — no bundler, no framework deps.
 *
 * URL patterns handled by the browser SPA:
 *   /                                              — login and org resolution entry
 *   /?org=<slug>&user=<userId>[&duration=<mins>]  — booking wizard
 *   /?ref=<confirmationRef>                        — view a confirmed booking
 */

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';

const clientPort = Number(
  process.env.CLIENT_PORT || new URL(env.CLIENT_BASE_URL).port || 3001,
);

function hasValue(v?: string): boolean {
  return Boolean(v && v.trim().length > 0);
}

// Server-side values injected into the browser once at page load.
const SERVER_CONFIG = JSON.stringify({
  api:   env.API_BASE_URL,
  isDev: env.NODE_ENV !== 'production',
  oauthProviders: {
    // UI visibility rule: show provider button only when its client ID is configured.
    google: hasValue(env.GOOGLE_CLIENT_ID),
    apple: hasValue(env.APPLE_CLIENT_ID),
    microsoft: hasValue(env.MICROSOFT_CLIENT_ID),
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// HTML Shell — inlines CSS + JS, serves as a single-page application.
// Exported so it can be inspected in tests without starting a server.
// ─────────────────────────────────────────────────────────────────────────────

export const BOOKING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Book an Appointment — TimePilot</title>
  <style>
    /* ─── Design Tokens ────────────────────────────────────────────── */
    :root {
      color-scheme: light;
      --bg:          #f3efe7;
      --panel:       #fffaf2;
      --text:        #1f2937;
      --muted:       #6b7280;
      --accent:      #0f766e;
      --accent-lite: #d1faf3;
      --accent-hov:  #0d9488;
      --border:      #e0dbd5;
      --error:       #dc2626;
      --radius:      16px;
      --shadow:      0 8px 40px rgba(15,118,110,0.10);
    }

    *, *::before, *::after { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top left, rgba(15,118,110,0.12), transparent 32%),
        linear-gradient(160deg, #faf7f2, var(--bg));
      font-family: Georgia, 'Times New Roman', serif;
      color: var(--text);
      padding: 32px 16px 64px;
    }

    /* ─── Layout ──────────────────────────────────────────────────── */
    .page { max-width: 680px; margin: 0 auto; }

    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 32px;
      box-shadow: var(--shadow);
    }

    /* ─── Typography ──────────────────────────────────────────────── */
    h1 { margin: 0 0 4px; font-size: clamp(1.6rem,3.5vw,2.4rem); line-height: 1.1; }
    h2 { margin: 0 0 20px; font-size: 1.25rem; font-weight: 600; }
    p  { margin: 0 0 16px; line-height: 1.6; color: var(--muted); }

    .chip {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 99px;
      background: var(--accent-lite);
      color: var(--accent);
      font-size: 0.72rem;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 10px;
    }

    /* ─── Buttons ─────────────────────────────────────────────────── */
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 11px 24px;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 0.95rem;
      font-family: inherit;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.15s;
    }
    .btn:hover { background: var(--accent-hov); }
    .btn:disabled { opacity: 0.55; cursor: not-allowed; }

    .btn-ghost {
      background: transparent;
      color: var(--accent);
      border: 1px solid var(--border);
    }
    .btn-ghost:hover { background: var(--accent-lite); border-color: var(--accent); }

    /* ─── Loading ─────────────────────────────────────────────────── */
    .spinner-wrap { display: flex; justify-content: center; padding: 48px 0; }
    .spinner {
      width: 36px; height: 36px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    .spinner-sm { width: 16px; height: 16px; border-width: 2px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ─── Org Header ──────────────────────────────────────────────── */
    .org-header {
      display: flex; align-items: center; gap: 16px;
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
    }
    .org-avatar {
      width: 52px; height: 52px;
      border-radius: 14px;
      background: var(--accent);
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 1.4rem; font-weight: 700;
      flex-shrink: 0; overflow: hidden;
    }
    .org-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .org-name { font-size: 1.1rem; font-weight: 600; }
    .org-desc { font-size: 0.88rem; color: var(--muted); margin: 2px 0 0; }

    /* ─── Calendar ────────────────────────────────────────────────── */
    .cal-nav {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px;
    }
    .cal-nav-btn {
      background: none;
      border: 1px solid var(--border);
      border-radius: 8px;
      width: 36px; height: 36px;
      cursor: pointer; color: var(--text); font-size: 1.1rem;
      display: flex; align-items: center; justify-content: center;
      transition: border-color 0.15s, background 0.15s;
    }
    .cal-nav-btn:hover { border-color: var(--accent); background: var(--accent-lite); }
    .cal-month-label { font-weight: 600; font-size: 1rem; }
    .cal-tz { font-size: 0.75rem; color: var(--muted); margin-bottom: 12px; }

    .cal-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
      margin-bottom: 24px;
    }
    .cal-dow {
      text-align: center;
      font-size: 0.72rem;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
      padding: 6px 0;
    }
    .cal-cell {
      aspect-ratio: 1;
      display: flex; align-items: center; justify-content: center;
      border-radius: 8px;
      font-size: 0.9rem;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background 0.12s, border-color 0.12s;
      user-select: none;
    }
    .cal-cell:hover:not(.past):not(.empty) {
      background: var(--accent-lite);
      border-color: var(--accent);
      color: var(--accent);
    }
    .cal-cell:hover.unavailable,
    .cal-cell:hover.loading {
      background: transparent;
      border-color: transparent;
      color: var(--border);
    }
    .cal-cell.today  { font-weight: 700; border-color: var(--accent); color: var(--accent); }
    .cal-cell.sel    { background: var(--accent); color: #fff; border-color: var(--accent); font-weight: 700; }
    .cal-cell.past   { color: var(--border); cursor: default; }
    .cal-cell.unavailable,
    .cal-cell.loading { color: var(--border); cursor: default; }
    .cal-cell.empty  { cursor: default; pointer-events: none; }

    /* ─── Slots ───────────────────────────────────────────────────── */
    .slots-section { margin-top: 28px; border-top: 1px solid var(--border); padding-top: 24px; }
    .slots-date-label { font-size: 0.9rem; font-weight: 600; color: var(--accent); margin-bottom: 12px; }
    .slots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 8px;
    }
    .slot-btn {
      padding: 10px 8px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--panel);
      font-size: 0.88rem;
      font-family: Georgia, serif;
      cursor: pointer;
      text-align: center;
      transition: border-color 0.12s, background 0.12s, color 0.12s;
      color: var(--text);
    }
    .slot-btn:hover { border-color: var(--accent); background: var(--accent-lite); color: var(--accent); }
    .no-slots { text-align: center; padding: 24px; color: var(--muted); font-size: 0.9rem; }

    /* ─── Form ────────────────────────────────────────────────────── */
    .back-link {
      display: inline-flex; align-items: center; gap: 6px;
      color: var(--accent); font-size: 0.88rem;
      cursor: pointer; margin-bottom: 20px;
      background: none; border: none; font-family: inherit; padding: 0;
    }
    .back-link:hover { text-decoration: underline; }

    .slot-summary {
      background: var(--accent-lite);
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 24px;
      font-size: 0.9rem;
    }
    .slot-summary strong { color: var(--accent); display: block; margin-bottom: 4px; font-size: 1rem; }

    .form-group { margin-bottom: 18px; }
    .form-group label {
      display: block;
      font-size: 0.8rem;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .form-group input,
    .form-group textarea {
      width: 100%; padding: 10px 14px;
      border: 1px solid var(--border); border-radius: 8px;
      font-size: 0.95rem; font-family: Georgia, serif;
      background: #fff; color: var(--text);
      transition: border-color 0.15s;
    }
    .form-group input:focus, .form-group textarea:focus { outline: none; border-color: var(--accent); }
    .form-group input.invalid { border-color: var(--error); }
    .form-group textarea { resize: vertical; min-height: 80px; }

    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 480px) { .form-row { grid-template-columns: 1fr; } }

    .form-actions { display: flex; gap: 12px; align-items: center; margin-top: 24px; }

    .alert-error {
      padding: 12px 16px;
      border-radius: 8px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: var(--error);
      font-size: 0.88rem;
      margin-bottom: 16px;
    }

    /* ─── Confirmation ────────────────────────────────────────────── */
    .confirmed-body { text-align: center; }
    .confirmed-icon {
      width: 64px; height: 64px;
      background: #dcfce7; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 2rem; margin: 0 auto 24px;
    }
    .confirmed-body h1 { margin-bottom: 8px; }
    .confirmed-body > p { color: var(--muted); margin-bottom: 24px; }

    .booking-detail {
      background: var(--accent-lite);
      border-radius: 12px;
      padding: 20px 24px;
      text-align: left;
      margin: 0 0 20px;
    }
    .booking-detail-row {
      display: flex; justify-content: space-between; gap: 8px;
      padding: 8px 0; border-bottom: 1px solid #b2f0e0;
    }
    .booking-detail-row:last-child { border-bottom: none; }
    .bd-key { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-family: Arial, sans-serif; }
    .bd-val { font-size: 0.9rem; text-align: right; color: var(--text); }

    .ref-code {
      font-family: Consolas, monospace;
      font-size: 1rem; font-weight: 700;
      color: var(--accent);
      cursor: pointer;
      border-bottom: 1px dashed var(--accent);
    }
    .ref-code:hover { color: var(--accent-hov); }

    /* ─── Center Card (welcome / error) ──────────────────────────── */
    .center-card { text-align: center; padding: 48px 32px; }
    .center-card .icon { font-size: 3rem; margin-bottom: 16px; }

    .sso-section { margin-top: 24px; }
    .sso-title {
      margin: 0 0 10px;
      font-size: 0.75rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }
    .sso-buttons { display: grid; gap: 10px; max-width: 320px; margin: 0 auto; }
    .sso-btn {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text);
      background: #fff;
      text-decoration: none;
      transition: border-color 0.15s, background 0.15s;
      font-size: 0.92rem;
    }
    .sso-btn:hover { border-color: var(--accent); background: var(--accent-lite); }
    .email-banner {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      border: 1px solid #f5d0a7;
      background: #fff7ed;
      color: #9a3412;
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 16px;
      font-size: 0.88rem;
    }
    .email-banner a {
      color: #9a3412;
      font-weight: 700;
      white-space: nowrap;
    }
    .org-select-list {
      display: grid;
      gap: 10px;
      margin-top: 16px;
    }
    .org-select-btn {
      width: 100%;
      text-align: left;
      border: 1px solid var(--border);
      background: #fff;
      color: var(--text);
      border-radius: 10px;
      padding: 12px 14px;
      cursor: pointer;
      transition: border-color 0.12s, background 0.12s;
    }
    .org-select-btn:hover {
      border-color: var(--accent);
      background: var(--accent-lite);
    }
    .org-select-name {
      font-size: 0.98rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 4px;
    }
    .org-select-meta {
      font-size: 0.82rem;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="page">
    <div id="app">
      <div class="card"><div class="spinner-wrap"><div class="spinner"></div></div></div>
    </div>
  </div>

  <script>
    // ─── Server-injected config ──────────────────────────────────────
    window.__TP = ${SERVER_CONFIG};

    // ─── State ──────────────────────────────────────────────────────
    var S = {
      step:      'init',
      org:       null,     // { id, name, slug, description, logoUrl }
      userId:    null,     // UUID of the bookable user
      organizations: [],
      emailNotifications: { googleLinked: false, enabled: true },
      adminMessage: null,
      creatingOrganization: false,
      intentChoice: null,
      duration:  60,       // Slot duration in minutes
      tz:        Intl.DateTimeFormat().resolvedOptions().timeZone,
      month:     null,     // Date set to 1st of displayed month
      day:       null,     // 'YYYY-MM-DD' selected in calendar
      slots:     [],       // [{ startTime, endTime }]
      slot:      null,     // Selected { startTime, endTime }
      booking:   null,     // { confirmationRef, clientName, startTime, endTime, timezone }
      error:     null,
      formError: null,
      availabilityByDay: {},
      availabilityLoading: false,
      availabilityMonthKey: null,
      hasAnyAvailability: null,
      selectingOrganization: false,
      // Admin settings panel
      settingsOrg: null,      // org being edited in settings panel
      settingsSaving: false,
      settingsMessage: null,
      settingsError: null,
      profileSaving: false,
      profileMessage: null,
      profileError: null,
      userProfile: null,       // { firstName, lastName, timezone, profileImageUrl }
      // Booking links panel
      bookingLinks: [],           // [{ id, token, label, userName, bookingUrl, isActive }]
      bookingLinksLoading: false,
      linkGenerating: false,
      linkGenerateError: null,
      // Availability management
      availabilities: [],         // [{ id, type, startTime, endTime, daysOfWeek, bufferMinutes, timezone }]
      availabilitiesLoading: false,
      availabilityError: null,
      availabilityMessage: null,
      newAvailabilityMode: 'recurring', // 'recurring' | 'one-time'
      newAvailabilityType: 'week',
      newAvailabilityStartDate: '',
      newAvailabilityEndDate: '',
      newAvailabilityStartTime: '09:00',
      newAvailabilityEndTime: '17:00',
      newAvailabilityDaysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
      newAvailabilityBufferMinutes: 0,
      newAvailabilitySaving: false,
      editingAvailabilityId: null,
      // Admin appointments page
      appointmentsOrg: null,
      appointments: [],
      appointmentsLoading: false,
      appointmentsError: null,
      appointmentsFilter: 'upcoming',
      editingApptId: null,
      rescheduleApptId: null,
      apptActionSaving: false,
      apptActionError: null,
      apptActionMessage: null,
      addingAppt: false,
    };

    function isLoopbackHost(hostname) {
      return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
    }

    function resolveBrowserApiBase() {
      var configured = (window.__TP && window.__TP.api) || '';
      if (!configured) return location.origin;

      try {
        var configuredUrl = new URL(configured, location.origin);
        if (!isLoopbackHost(location.hostname) && isLoopbackHost(configuredUrl.hostname)) {
          return location.origin;
        }
        return configuredUrl.origin;
      } catch (_) {
        return location.origin;
      }
    }

    // ─── API helper ─────────────────────────────────────────────────
    function apiFetch(path, opts) {
      var url      = resolveBrowserApiBase() + path;
      var fetchOpts = { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
      if (opts && opts.method) fetchOpts.method = opts.method;
      if (opts && opts.body)   fetchOpts.body   = JSON.stringify(opts.body);
      return fetch(url, fetchOpts).then(function(r) {
        if (r.status === 204) return null;
        return r.json().then(function(data) {
          if (!r.ok) throw new Error(data.message || 'Request failed (' + r.status + ')');
          return data;
        });
      });
    }

    // ─── Boot ────────────────────────────────────────────────────────
    function boot() {
      var p    = new URLSearchParams(location.search);
      var path = location.pathname;
      var d    = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
      S.month  = d;

      var ref  = p.get('ref');
      var org  = p.get('org');
      var user = p.get('user');
      var dur  = parseInt(p.get('duration') || '60', 10);
      var selectOrg = p.get('selectOrg') === '1';

      if (ref)  { loadByRef(ref); return; }

      var bk = p.get('bk');
      if (bk) {
        S.step = 'loading'; render();
        apiFetch('/api/b/' + encodeURIComponent(bk))
          .then(function(data) {
            S.userId   = data.userId;
            S.duration = (isNaN(dur) || dur < 15) ? 60 : dur;
            loadOrg(data.organizationSlug);
          })
          .catch(function() {
            S.step = 'error';
            S.error = 'This booking link is invalid or has expired.';
            render();
          });
        return;
      }

      S.duration = (isNaN(dur) || dur < 15) ? 60 : dur;

      if (path === '/admin') {
        loadSessionContext(true);
        return;
      }

      if (!org || !user) {
        loadSessionContext(selectOrg);
        return;
      }

      S.userId   = user;
      loadOrg(org);
    }

    function loadSessionContext(forceOrgSelection) {
      S.step = 'loading'; render();

      apiFetch('/api/auth/session')
        .then(function(session) {
          if (!session || !session.userId) {
            S.step = 'welcome';
            render();
            return;
          }

          S.userId = session.userId;
          loadOrganizationContext(forceOrgSelection);
        })
        .catch(function() {
          S.step = 'welcome';
          render();
        });
    }

    function redirectToBookingSlug(slug) {
      var next = '/?org=' + encodeURIComponent(slug)
        + '&user=' + encodeURIComponent(S.userId)
        + '&duration=' + encodeURIComponent(S.duration);
      location.replace(next);
    }

    function redirectToAdmin() {
      location.replace('/admin');
    }

    function loadOrganizationContext(forceOrgSelection) {
      apiFetch('/api/auth/organizations')
        .then(function(ctx) {
          var orgs = (ctx && ctx.organizations) || [];
          S.organizations = orgs;
          S.emailNotifications = (ctx && ctx.emailNotifications)
            ? ctx.emailNotifications
            : { googleLinked: false, enabled: true };

          if (orgs.length === 0) {
            S.step = 'admin-empty';
            render();
            return;
          }

          if (orgs.length === 1 && !forceOrgSelection && location.pathname !== '/admin') {
            redirectToAdmin();
            return;
          }

          if (orgs.length > 1 || forceOrgSelection || location.pathname === '/admin') {
            S.step = 'admin';
            render();
            return;
          }

          redirectToAdmin();
        })
        .catch(function() {
          S.step = 'welcome';
          render();
        });
    }

    // ─── Data loaders ────────────────────────────────────────────────
    function loadOrg(slug) {
      S.step = 'loading'; render();
      apiFetch('/api/organizations/slug/' + encodeURIComponent(slug))
        .then(function(org) {
          S.org = org;
          ensureInitialAvailability();
        })
        .catch(function()   { S.error = 'Booking page not found. Please check the link.'; S.step = 'error'; render(); });
    }

    function monthKey(dateObj) {
      return dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0');
    }

    function loadMonthAvailability() {
      if (!S.org || !S.userId) return;

      var year = S.month.getFullYear();
      var month = S.month.getMonth();
      var total = new Date(year, month + 1, 0).getDate();
      var today = todayYMD();
      var key = monthKey(S.month);

      S.availabilityMonthKey = key;
      S.availabilityByDay = {};
      S.availabilityLoading = true;
      render();

      var days = [];
      for (var d = 1; d <= total; d++) {
        var ymd = buildYMD(year, month, d);
        if (ymd >= today) days.push(ymd);
      }

      if (days.length === 0) {
        S.availabilityLoading = false;
        render();
        return;
      }

      var requests = days.map(function(ymd) {
        var qs = 'userId='    + encodeURIComponent(S.userId)
               + '&date='     + encodeURIComponent(ymd)
               + '&timezone=' + encodeURIComponent(S.tz)
               + '&duration=' + S.duration;
        return apiFetch('/api/organizations/' + S.org.id + '/availability/slots?' + qs)
          .then(function(data) {
            var slots = (data && data.slots) || [];
            return { ymd: ymd, available: slots.length > 0 };
          })
          .catch(function() {
            return { ymd: ymd, available: false };
          });
      });

      Promise.all(requests).then(function(results) {
        // Ignore stale responses when user navigates to another month quickly.
        if (S.availabilityMonthKey !== key) return;

        results.forEach(function(result) {
          S.availabilityByDay[result.ymd] = result.available;
        });
        S.availabilityLoading = false;

        if (S.day && S.day.slice(0, 7) === key && S.availabilityByDay[S.day] === false) {
          S.day = null;
          S.slot = null;
          S.slots = [];
          if (S.step === 'slots' || S.step === 'slot-loading') {
            S.step = 'calendar';
          }
        }

        render();
      });
    }

    function ensureInitialAvailability() {
      if (!S.org || !S.userId) return;

      var baseMonth = new Date(S.month);
      baseMonth.setDate(1);
      baseMonth.setHours(0, 0, 0, 0);

      function probe(offset) {
        if (offset > 11) {
          S.hasAnyAvailability = false;
          S.availabilityLoading = false;
          S.step = 'no-availability';
          render();
          return;
        }

        var targetMonth = new Date(baseMonth);
        targetMonth.setMonth(baseMonth.getMonth() + offset);
        var key = monthKey(targetMonth);

        var year = targetMonth.getFullYear();
        var month = targetMonth.getMonth();
        var total = new Date(year, month + 1, 0).getDate();
        var today = todayYMD();
        var days = [];

        for (var d = 1; d <= total; d++) {
          var ymd = buildYMD(year, month, d);
          if (ymd >= today) days.push(ymd);
        }

        if (days.length === 0) {
          probe(offset + 1);
          return;
        }

        var requests = days.map(function(ymd) {
          var qs = 'userId='    + encodeURIComponent(S.userId)
                 + '&date='     + encodeURIComponent(ymd)
                 + '&timezone=' + encodeURIComponent(S.tz)
                 + '&duration=' + S.duration;
          return apiFetch('/api/organizations/' + S.org.id + '/availability/slots?' + qs)
            .then(function(data) {
              var slots = (data && data.slots) || [];
              return { ymd: ymd, available: slots.length > 0 };
            })
            .catch(function() {
              return { ymd: ymd, available: false };
            });
        });

        Promise.all(requests).then(function(results) {
          var availabilityByDay = {};
          var firstAvailableDay = null;

          results.forEach(function(result) {
            availabilityByDay[result.ymd] = result.available;
            if (!firstAvailableDay && result.available) {
              firstAvailableDay = result.ymd;
            }
          });

          if (!firstAvailableDay) {
            probe(offset + 1);
            return;
          }

          S.hasAnyAvailability = true;
          S.month = targetMonth;
          S.availabilityMonthKey = key;
          S.availabilityByDay = availabilityByDay;
          S.availabilityLoading = false;
          S.step = 'calendar';
          render();
          loadSlots(firstAvailableDay);
        }).catch(function() {
          probe(offset + 1);
        });
      }

      S.availabilityLoading = true;
      S.step = 'loading';
      render();
      probe(0);
    }

    function loadSlots(day) {
      S.day  = day;
      S.slot = null;
      S.step = 'slot-loading'; render();
      var qs = 'userId='    + encodeURIComponent(S.userId)
             + '&date='     + encodeURIComponent(day)
             + '&timezone=' + encodeURIComponent(S.tz)
             + '&duration=' + S.duration;
      apiFetch('/api/organizations/' + S.org.id + '/availability/slots?' + qs)
        .then(function(data) { S.slots = data.slots || []; S.step = 'slots'; render(); })
        .catch(function()     { S.slots = [];    S.step = 'slots'; render(); });
    }

    function loadByRef(ref) {
      S.step = 'loading'; render();
      apiFetch('/api/appointments/confirm/' + encodeURIComponent(ref))
        .then(function(data) { S.booking = data; S.step = 'confirmed'; render(); })
        .catch(function()    { S.error = 'Booking not found. The reference may be incorrect.'; S.step = 'error'; render(); });
    }

    function loadAdminAppointments(orgId) {
      S.appointmentsLoading = true;
      S.appointmentsError = null;
      render();
      apiFetch('/api/organizations/' + orgId + '/appointments?limit=200')
        .then(function(data) {
          S.appointments = Array.isArray(data) ? data : [];
          S.appointmentsLoading = false;
          render();
        })
        .catch(function(err) {
          S.appointmentsLoading = false;
          S.appointmentsError = (err && err.message) || 'Failed to load appointments';
          render();
        });
    }

    function bookAppointment(formData) {
      S.step = 'submitting'; render();
      apiFetch('/api/organizations/' + S.org.id + '/appointments', {
        method: 'POST',
        body: {
          userId:      S.userId,
          clientName:  formData.name,
          clientEmail: formData.email,
          clientPhone: formData.phone  || undefined,
          startTime:   S.slot.startTime,
          endTime:     S.slot.endTime,
          timezone:    S.tz,
          notes:       formData.notes  || undefined,
        },
      })
        .then(function(booking) {
          S.booking = booking;
          history.replaceState(null, '', '?ref=' + booking.confirmationRef);
          S.step = 'confirmed'; render();
        })
        .catch(function(e) {
          S.formError = e.message || 'Booking failed. The slot may no longer be available.';
          S.step = 'form'; render();
        });
    }

    // ─── Formatting helpers ──────────────────────────────────────────
    function fmtTime(utcIso) {
      return new Date(utcIso).toLocaleTimeString(navigator.language, {
        timeZone: S.tz, hour: 'numeric', minute: '2-digit', hour12: true,
      });
    }

    function fmtDate(utcIso, extra) {
      var opts = Object.assign(
        { timeZone: S.tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
        extra || {}
      );
      return new Date(utcIso).toLocaleDateString(navigator.language, opts);
    }

    // Returns YYYY-MM-DD using en-CA locale which always gives ISO date format.
    function localYMD(dateObj) { return dateObj.toLocaleDateString('en-CA', { timeZone: S.tz }); }
    function todayYMD()        { return localYMD(new Date()); }
    function monthLabel()      { return S.month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }

    function ymdToUtcDate(ymd) {
      var parts = String(ymd || '').split('-').map(function(x) { return parseInt(x, 10); });
      if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
      return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0));
    }

    function addDaysToYmd(ymd, daysToAdd) {
      var base = ymdToUtcDate(ymd);
      if (!base) return '';
      base.setUTCDate(base.getUTCDate() + daysToAdd);
      return base.toISOString().slice(0, 10);
    }

    function daysBetweenInclusive(startYmd, endYmd) {
      var start = ymdToUtcDate(startYmd);
      var end = ymdToUtcDate(endYmd);
      if (!start || !end) return 0;
      var diff = end.getTime() - start.getTime();
      if (diff < 0) return 0;
      return Math.floor(diff / 86400000) + 1;
    }

    function fmtYmdInTimezone(utcIso, tz) {
      return new Date(utcIso).toLocaleDateString('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    }

    function fmtTimeInTimezone(utcIso, tz) {
      return new Date(utcIso).toLocaleTimeString(navigator.language, {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }

    function availabilityTypeDescription(type) {
      switch (type) {
        case 'hour':
          return 'Hourly slot: applies one exact time window on each selected date in the range.';
        case 'day':
          return 'Single day: creates a working window for each date in the selected range.';
        case 'month':
          return 'Monthly window: applies the same daily hours to each date in the selected range.';
        case 'week':
        default:
          return 'Weekly repeating: use a date range and pick weekdays. Only those weekdays will be bookable inside the range.';
      }
    }

    function buildYMD(year, month, day) {
      return year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    }

    // Convert a local date (YYYY-MM-DD) + time (HH:MM) in the given IANA timezone to a UTC ISO string.
    // Uses iterative Intl-based correction (same pattern as the availability form handler).
    function convertLocalToUTC(localDate, localTime, tz) {
      var parts = localDate.split('-').map(function(x) { return parseInt(x, 10); });
      var year = parts[0], month = parts[1], day = parts[2];
      var timeParts = localTime.split(':').map(function(x) { return parseInt(x, 10); });
      var hour = timeParts[0], minute = timeParts[1];
      var desiredUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
      var candidateUtcMs = desiredUtcMs;
      var formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
      for (var i = 0; i < 3; i++) {
        var formatted = formatter.formatToParts(new Date(candidateUtcMs));
        var lookup = {};
        formatted.forEach(function(p) { lookup[p.type] = p.value; });
        var actualUtcMs = Date.UTC(
          parseInt(lookup.year, 10), parseInt(lookup.month, 10) - 1, parseInt(lookup.day, 10),
          parseInt(lookup.hour, 10), parseInt(lookup.minute, 10), 0, 0
        );
        candidateUtcMs = desiredUtcMs - (actualUtcMs - desiredUtcMs);
      }
      return new Date(candidateUtcMs).toISOString();
    }

    function hasAppointmentTimeConflict(startIso, endIso, excludeAppointmentId) {
      var startMs = new Date(startIso).getTime();
      var endMs = new Date(endIso).getTime();
      if (!isFinite(startMs) || !isFinite(endMs) || endMs <= startMs) return false;

      var appointments = S.appointments || [];
      for (var i = 0; i < appointments.length; i++) {
        var appt = appointments[i];
        if (!appt || appt.status === 'cancelled') continue;
        if (excludeAppointmentId && appt.id === excludeAppointmentId) continue;

        var apptStart = new Date(appt.startTime).getTime();
        var apptEnd = new Date(appt.endTime).getTime();
        if (!isFinite(apptStart) || !isFinite(apptEnd)) continue;

        var overlaps = startMs < apptEnd && endMs > apptStart;
        if (overlaps) return true;
      }

      return false;
    }

    // HTML-escape user content to prevent XSS.
    function esc(str) {
      return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    }

    function copyRef(el) {
      if (!el || !S.booking) return;
      var ref = S.booking.confirmationRef;
      navigator.clipboard.writeText(ref).then(function() {
        var orig = el.textContent;
        el.textContent = 'Copied!';
        setTimeout(function() { el.textContent = orig; }, 1600);
      }).catch(function() {});
    }

    // ─── Render ──────────────────────────────────────────────────────
    function render() {
      var app = document.getElementById('app');
      switch (S.step) {
        case 'loading':      app.innerHTML = tmplLoading();   break;
        case 'welcome':      app.innerHTML = tmplWelcome();   break;
        case 'admin':        app.innerHTML = tmplAdmin();     break;
        case 'admin-empty':  app.innerHTML = tmplAdminEmpty(); break;
        case 'admin-settings': app.innerHTML = tmplAdminSettings(); break;
        case 'admin-appointments': app.innerHTML = tmplAdminAppointments(); break;
        case 'org-select':   app.innerHTML = tmplOrgSelection(); break;
        case 'no-availability': app.innerHTML = tmplNoAvailability(); break;
        case 'error':        app.innerHTML = tmplError();     break;
        case 'calendar':
        case 'slot-loading':
        case 'slots':        app.innerHTML = tmplCalendar();  break;
        case 'form':
        case 'submitting':   app.innerHTML = tmplForm();      break;
        case 'confirmed':    app.innerHTML = tmplConfirmed(); break;
        default:             app.innerHTML = tmplLoading();
      }
    }

    // ─── Templates ───────────────────────────────────────────────────
    function tmplLoading() {
      return '<div class="card"><div class="spinner-wrap"><div class="spinner"></div></div></div>';
    }

    function tmplWelcome() {
      var providers = (window.__TP && window.__TP.oauthProviders) || {};
      var buttons = [];
      var orgSlug = new URLSearchParams(location.search).get('org');
      var returnTo = encodeURIComponent(orgSlug ? location.href : (location.origin + '/admin'));

      function buildAuthHref(providerPath) {
        var params = [];
        if (orgSlug) params.push('org=' + encodeURIComponent(orgSlug));
        params.push('returnTo=' + returnTo);
        return resolveBrowserApiBase() + providerPath + '?' + params.join('&');
      }

      if (providers.google) {
        buttons.push('<a class="sso-btn" href="' + buildAuthHref('/api/auth/google/callback') + '">Continue with Google</a>');
      }
      if (providers.apple) {
        buttons.push('<a class="sso-btn" href="' + buildAuthHref('/api/auth/apple/callback') + '">Continue with Apple</a>');
      }
      if (providers.microsoft) {
        buttons.push('<a class="sso-btn" href="' + buildAuthHref('/api/auth/microsoft/callback') + '">Continue with Microsoft</a>');
      }

      var sso = buttons.length > 0
        ? '<div class="sso-section">'
          + '<p class="sso-title">Sign in with SSO</p>'
          + '<div class="sso-buttons">' + buttons.join('') + '</div>'
          + '</div>'
        : '';

      return '<div class="card center-card">'
        + '<div class="icon">&#128197;</div>'
        + '<h1 style="font-size:1.8rem">TimePilot</h1>'
        + '<p>To book an appointment, use a scheduling link shared by your host.</p>'
        + sso
        + '</div>';
    }

    function tmplEmailBanner() {
      if (!S.emailNotifications || !S.emailNotifications.googleLinked || S.emailNotifications.enabled) {
        return '';
      }

      var enableUrl = resolveBrowserApiBase()
        + '/api/auth/google/enable-email-scope?returnTo='
        + encodeURIComponent(location.href);

      return '<div class="email-banner">'
        + '<span>Email notifications are disabled because Gmail access is not enabled.</span>'
        + '<a href="' + enableUrl + '">Enable now</a>'
        + '</div>';
    }

    function tmplAdminOrgList(showBookingLinks) {
      return (S.organizations || []).map(function(org) {
        var bookingHref = '/?org=' + encodeURIComponent(org.slug)
          + '&user=' + encodeURIComponent(S.userId)
          + '&duration=' + encodeURIComponent(S.duration);
        var canSettings = org.role === 'owner' || org.role === 'admin';
        return '<div class="org-select-btn">'
          + '<div class="org-select-name">' + esc(org.name) + '</div>'
          + '<div class="org-select-meta">Role: ' + esc(org.role) + ' • ' + esc(org.slug) + '</div>'
          + '<div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">'
          + '<button class="btn btn-ghost" data-org-id="' + esc(org.id) + '" data-org-slug="' + esc(org.slug) + '">Open org</button>'
          + (showBookingLinks
              ? '<a class="btn btn-ghost" href="' + bookingHref + '">Booking link</a>'
              : '')
            + (canSettings
              ? '<button class="btn" data-settings-org-id="' + esc(org.id) + '">Settings</button>'
              : '')
            + (canSettings
              ? '<button class="btn btn-ghost" data-appointments-org-id="' + esc(org.id) + '">Appointments</button>'
              : '')
            + '</div>'
            + '</div>';
      }).join('');
    }

    function tmplAdminSettings() {
      var org = S.settingsOrg;
      if (!org) return tmplLoading();
      var defaultDate = new Date().toISOString().slice(0, 10);
      var isRecurring = S.newAvailabilityMode !== 'one-time';
      var availFromDate = S.newAvailabilityStartDate || defaultDate;
      var defaultUntilDate = (function() {
        var parts = availFromDate.split('-').map(function(x) { return parseInt(x, 10); });
        var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0));
        d.setUTCFullYear(d.getUTCFullYear() + 1);
        return d.toISOString().slice(0, 10);
      })();
      var availUntilDate = S.newAvailabilityEndDate || defaultUntilDate;
      return '<div class="card">'
        + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">'
        + '<button class="btn btn-ghost" id="settings-back" style="padding:8px 14px">&#8592; Back</button>'
        + '<div>'
        + '<span class="chip">Settings</span>'
        + '<h2 style="margin:4px 0 0">' + esc(org.name) + '</h2>'
        + '</div>'
        + '</div>'
        // Org Branding
        + '<h3 style="margin:0 0 16px;font-size:1rem;font-weight:700">Organization branding</h3>'
        + '<form id="settings-org-form">'
        + '<div class="form-group">'
        + '<label for="settings-org-name">Name</label>'
        + '<input id="settings-org-name" name="name" type="text" value="' + esc(org.name || '') + '" placeholder="Acme Studio" />'
        + '</div>'
        + '<div class="form-group">'
        + '<label for="settings-org-desc">Description</label>'
        + '<input id="settings-org-desc" name="description" type="text" value="' + esc(org.description || '') + '" placeholder="A short description (shown on booking pages)" />'
        + '</div>'
        + '<div class="form-group">'
        + '<label for="settings-org-logo">Logo URL</label>'
        + '<input id="settings-org-logo" name="logoUrl" type="url" value="' + esc(org.logoUrl || '') + '" placeholder="https://example.com/logo.png" />'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        + '<div class="form-group">'
        + '<label for="settings-org-primary">Primary color</label>'
        + '<input id="settings-org-primary" name="primaryColor" type="color" value="' + esc(org.primaryColor || '#0f766e') + '" style="height:44px;cursor:pointer" />'
        + '</div>'
        + '<div class="form-group">'
        + '<label for="settings-org-secondary">Secondary color</label>'
        + '<input id="settings-org-secondary" name="secondaryColor" type="color" value="' + esc(org.secondaryColor || '#d1faf3') + '" style="height:44px;cursor:pointer" />'
        + '</div>'
        + '</div>'
        + '<div class="form-group">'
        + '<label for="settings-org-font">Font family</label>'
        + '<select id="settings-org-font" name="fontFamily" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.95rem;background:white">'
        + ['Georgia, serif', 'Arial, sans-serif', '"Helvetica Neue", sans-serif', '"Times New Roman", serif', 'Verdana, sans-serif'].map(function(f) {
            var val = f.split(',')[0].replace(/"/g,'');
            var sel = (org.fontFamily && org.fontFamily.split(',')[0].trim() === val) ? ' selected' : '';
            return '<option value="' + esc(f) + '"' + sel + '>' + esc(val) + '</option>';
          }).join('')
        + '</select>'
        + '</div>'
        + (S.settingsError ? '<div class="alert-error">' + esc(S.settingsError) + '</div>' : '')
        + (S.settingsMessage ? '<p style="color:var(--accent);font-weight:600">' + esc(S.settingsMessage) + '</p>' : '')
        + '<button class="btn" type="submit"' + (S.settingsSaving ? ' disabled' : '') + '>'
        + (S.settingsSaving ? '<span class="spinner spinner-sm"></span> Saving…' : 'Save branding')
        + '</button>'
        + '</form>'
        // User Profile
        + '<hr style="border:none;border-top:1px solid var(--border);margin:32px 0" />'
        + '<h3 style="margin:0 0 16px;font-size:1rem;font-weight:700">Your profile</h3>'
        + '<form id="settings-profile-form">'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        + '<div class="form-group">'
        + '<label for="settings-first">First name</label>'
        + '<input id="settings-first" name="firstName" type="text" value="' + esc((S.userProfile && S.userProfile.firstName) || '') + '" />'
        + '</div>'
        + '<div class="form-group">'
        + '<label for="settings-last">Last name</label>'
        + '<input id="settings-last" name="lastName" type="text" value="' + esc((S.userProfile && S.userProfile.lastName) || '') + '" />'
        + '</div>'
        + '</div>'
        + '<div class="form-group">'
        + '<label for="settings-tz">Timezone</label>'
        + '<input id="settings-tz" name="timezone" type="text" value="' + esc((S.userProfile && S.userProfile.timezone) || S.tz) + '" placeholder="America/New_York" />'
        + '<p style="margin:4px 0 0;font-size:0.8rem;color:var(--muted)">Use IANA format (e.g. America/New_York, Europe/London, UTC)</p>'
        + '</div>'
        + (S.profileError ? '<div class="alert-error">' + esc(S.profileError) + '</div>' : '')
        + (S.profileMessage ? '<p style="color:var(--accent);font-weight:600">' + esc(S.profileMessage) + '</p>' : '')
        + '<button class="btn" type="submit"' + (S.profileSaving ? ' disabled' : '') + '>'
        + (S.profileSaving ? '<span class="spinner spinner-sm"></span> Saving…' : 'Save profile')
        + '</button>'
        + '</form>'
        + '</form>'
        // ── Booking Links ──────────────────────────────────────────
        + '<hr style="border:none;border-top:1px solid var(--border);margin:32px 0" />'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'
        + '<h3 style="margin:0;font-size:1rem;font-weight:700">Booking links</h3>'
        + '<button class="btn" id="generate-booking-link"'
        + (S.linkGenerating ? ' disabled' : '') + '>'
        + (S.linkGenerating ? '<span class="spinner spinner-sm"></span> Generating…' : '+ Generate link')
        + '</button>'
        + '</div>'
        + '<p style="margin:0 0 16px;font-size:0.85rem;color:var(--muted)">Share a booking link without exposing your internal IDs. Each link can be revoked at any time.</p>'
        + (S.linkGenerateError ? '<div class="alert-error">' + esc(S.linkGenerateError) + '</div>' : '')
        + (S.bookingLinksLoading
          ? '<p style="color:var(--muted);font-size:0.9rem"><span class="spinner spinner-sm"></span> Loading links…</p>'
          : (S.bookingLinks.length === 0
            ? '<p style="color:var(--muted);font-size:0.9rem">No booking links yet. Generate one to share with clients.</p>'
            : S.bookingLinks.map(function(lnk) {
              return '<div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px">'
                + '<div style="display:flex;align-items:flex-start;gap:12px">'
                + '<div style="flex:1;min-width:0">'
                + (lnk.label ? '<p style="margin:0 0 4px;font-weight:600;font-size:0.9rem">' + esc(lnk.label) + '</p>' : '')
                + '<p style="margin:0 0 2px;font-size:0.8rem;color:var(--muted)">' + esc(lnk.userName) + '</p>'
                + '<code style="display:block;background:var(--accent-lite);padding:6px 8px;border-radius:6px;font-size:0.78rem;word-break:break-all;margin:6px 0">' + esc(lnk.bookingUrl) + '</code>'
                + '</div>'
                + '<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">'
                + '<button class="btn btn-ghost" style="padding:6px 10px;font-size:0.8rem" data-copy-link="' + esc(lnk.bookingUrl) + '">Copy</button>'
                + '<button class="btn btn-ghost" style="padding:6px 10px;font-size:0.8rem" data-toggle-qr="' + esc(lnk.token) + '">QR</button>'
                + '<button class="btn btn-ghost" style="padding:6px 10px;font-size:0.8rem;color:#dc2626" data-delete-link-id="' + esc(lnk.id) + '">Delete</button>'
                + '</div>'
                + '</div>'
                + '<div id="qr-' + esc(lnk.token) + '" style="display:none;margin-top:10px;text-align:center">'
                + '<img src="' + resolveBrowserApiBase() + '/api/b/' + esc(lnk.token) + '/qr" alt="QR code" style="width:160px;height:160px;border:1px solid var(--border);border-radius:8px" />'
                + '<p style="margin:6px 0 0;font-size:0.75rem;color:var(--muted)">Scan to open booking page</p>'
                + '</div>'
                + '</div>';
              }).join('')
            )
          )
        + '</div>'
        // ── Availability Management ────────────────────────────────
        + '<hr style="border:none;border-top:1px solid var(--border);margin:32px 0" />'
        + '<h3 style="margin:0 0 16px;font-size:1rem;font-weight:700">Availability schedule</h3>'
        + '<p style="margin:0 0 16px;font-size:0.85rem;color:var(--muted)">Set your available hours. Use <strong>Recurring</strong> for regular weekly hours, or <strong>One-time</strong> for a specific date.</p>'
        + (S.availabilityError ? '<div class="alert-error">' + esc(S.availabilityError) + '</div>' : '')
        + (S.availabilityMessage ? '<p style="color:var(--accent);font-weight:600;margin-bottom:12px">' + esc(S.availabilityMessage) + '</p>' : '')
        + '<form id="availability-form" style="border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:16px;background:var(--accent-lite)">'
        + '<h4 style="margin:0 0 16px;font-size:0.95rem;font-weight:600">Add availability</h4>'
        + '<div style="display:flex;background:white;border:1px solid var(--border);border-radius:8px;padding:3px;gap:3px;margin-bottom:20px">'
        + '<button type="button" data-avail-mode="recurring" style="flex:1;padding:8px 12px;border:none;border-radius:6px;font-size:0.9rem;font-weight:600;cursor:pointer;' + (isRecurring ? 'background:var(--accent);color:white' : 'background:transparent;color:var(--muted)') + '">&#x21BB; Recurring</button>'
        + '<button type="button" data-avail-mode="one-time" style="flex:1;padding:8px 12px;border:none;border-radius:6px;font-size:0.9rem;font-weight:600;cursor:pointer;' + (!isRecurring ? 'background:var(--accent);color:white' : 'background:transparent;color:var(--muted)') + '">&#x1F4C5; One-time</button>'
        + '</div>'
        + (isRecurring
          ? '<div class="form-group">'
          + '<label>Repeat on</label>'
          + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">'
          + [
            { val: 1, label: 'Mon' },
            { val: 2, label: 'Tue' },
            { val: 3, label: 'Wed' },
            { val: 4, label: 'Thu' },
            { val: 5, label: 'Fri' },
            { val: 6, label: 'Sat' },
            { val: 0, label: 'Sun' }
          ].map(function(d) {
            var checked = (S.newAvailabilityDaysOfWeek || []).indexOf(d.val) >= 0;
            return '<label style="display:flex;align-items:center;cursor:pointer;padding:6px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.85rem;font-weight:600;background:' + (checked ? 'var(--accent)' : 'white') + ';color:' + (checked ? 'white' : 'inherit') + '">'
              + '<input type="checkbox" name="dayOfWeek" value="' + d.val + '"' + (checked ? ' checked' : '') + ' style="display:none" />'
              + esc(d.label)
              + '</label>';
          }).join('')
          + '</div>'
          + '</div>'
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
          + '<div class="form-group">'
          + '<label for="avail-from-date">Active from</label>'
          + '<input id="avail-from-date" name="fromDate" type="date" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px" value="' + esc(availFromDate) + '" />'
          + '</div>'
          + '<div class="form-group">'
          + '<label for="avail-until-date">Until <span style="font-weight:400;color:var(--muted)">(optional)</span></label>'
          + '<input id="avail-until-date" name="untilDate" type="date" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px" value="' + esc(availUntilDate) + '" />'
          + '</div>'
          + '</div>'
          : '<div class="form-group">'
          + '<label for="avail-date">Date</label>'
          + '<input id="avail-date" name="date" type="date" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px" value="' + esc(availFromDate) + '" />'
          + '</div>'
        )
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        + '<div class="form-group">'
        + '<label for="avail-start">Start time</label>'
        + '<input id="avail-start" name="startTime" type="time" value="' + esc(S.newAvailabilityStartTime) + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px" />'
        + '</div>'
        + '<div class="form-group">'
        + '<label for="avail-end">End time</label>'
        + '<input id="avail-end" name="endTime" type="time" value="' + esc(S.newAvailabilityEndTime) + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px" />'
        + '</div>'
        + '</div>'
        + '<div class="form-group">'
        + '<label for="avail-buffer">Buffer between appointments <span style="font-weight:400;color:var(--muted)">(minutes)</span></label>'
        + '<input id="avail-buffer" name="bufferMinutes" type="number" min="0" max="480" value="' + (S.newAvailabilityBufferMinutes || 0) + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px" />'
        + '</div>'
        + '<button class="btn" type="submit"' + (S.newAvailabilitySaving ? ' disabled' : '') + '>'
        + (S.newAvailabilitySaving ? '<span class="spinner spinner-sm"></span> Adding…' : '+ Add availability')
        + '</button>'
        + '</form>'
        + (S.availabilitiesLoading
          ? '<p style="color:var(--muted);font-size:0.9rem"><span class="spinner spinner-sm"></span> Loading availabilities…</p>'
          : (S.availabilities.length === 0
            ? '<p style="color:var(--muted);font-size:0.9rem">No availability rules yet. Add one above to enable bookings.</p>'
            : '<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">'
            + '<table style="width:100%;border-collapse:collapse;font-size:0.9rem">'
            + '<thead style="background:var(--accent-lite);border-bottom:1px solid var(--border)">'
            + '<tr>'
            + '<th style="padding:12px 16px;text-align:left;font-weight:600">Type</th>'
            + '<th style="padding:12px 16px;text-align:left;font-weight:600">Schedule</th>'
            + '<th style="padding:12px 16px;text-align:left;font-weight:600">Action</th>'
            + '</tr>'
            + '</thead>'
            + '<tbody>'
            + (S.availabilities || []).map(function(avail) {
              var tz = avail.timezone || S.tz;
              var startDateLocal = fmtYmdInTimezone(avail.startTime, tz);
              var endDateLocal = fmtYmdInTimezone(avail.endTime, tz);
              var dateLabel = startDateLocal === endDateLocal
                ? startDateLocal
                : (startDateLocal + ' to ' + endDateLocal);
              var timeStr = fmtTimeInTimezone(avail.startTime, tz) + ' - ' + fmtTimeInTimezone(avail.endTime, tz);
              var daysStr = '';
              if (avail.type === 'week' && avail.daysOfWeek) {
                var dayNames = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };
                daysStr = avail.daysOfWeek.map(function(d) { return dayNames[d] || d; }).join(', ');
              }
              var scheduleText = avail.type === 'week' 
                ? (daysStr + ' | ' + dateLabel + ' | ' + timeStr + ' (' + tz + ')')
                : (dateLabel + ' | ' + timeStr + ' (' + tz + ')');
              var typeLabel = avail.type === 'week' ? 'Recurring' : avail.type === 'day' ? 'One-time' : avail.type.toUpperCase();
              return '<tr style="border-bottom:1px solid var(--border)">'
                + '<td style="padding:12px 16px"><span style="background:var(--accent-lite);padding:4px 8px;border-radius:4px;font-size:0.8rem;font-weight:600">' + esc(typeLabel) + '</span></td>'
                + '<td style="padding:12px 16px"><code style="font-size:0.85rem">' + esc(scheduleText) + '</code></td>'
                + '<td style="padding:12px 16px">'
                + '<button class="btn btn-ghost" style="padding:4px 8px;font-size:0.8rem;color:#dc2626" data-delete-avail-id="' + esc(avail.id) + '">Delete</button>'
                + '</td>'
                + '</tr>';
            }).join('')
            + '</tbody>'
            + '</table>'
            + '</div>'
          )
        )
        + '</div>';
    }

    function tmplAdminAppointments() {
      var org = S.appointmentsOrg;
      if (!org) return tmplLoading();

      var now = new Date().toISOString();
      var allAppts = S.appointments || [];
      var filtered = allAppts.filter(function(a) {
        if (S.appointmentsFilter === 'upcoming') return a.startTime >= now;
        if (S.appointmentsFilter === 'past')     return a.startTime < now;
        return true;
      }).slice().sort(function(a, b) {
        var dir = S.appointmentsFilter === 'past' ? -1 : 1;
        return dir * (new Date(a.startTime) - new Date(b.startTime));
      });

      var editAppt     = S.editingApptId    && allAppts.find(function(a) { return a.id === S.editingApptId; });
      var reschedAppt  = S.rescheduleApptId && allAppts.find(function(a) { return a.id === S.rescheduleApptId; });

      // ── Filter tabs ─────────────────────────────────────────────────
      var filterTabs = ['upcoming', 'past', 'all'].map(function(f) {
        var active = S.appointmentsFilter === f;
        var label  = f === 'upcoming' ? 'Upcoming' : f === 'past' ? 'Past' : 'All';
        return '<button type="button" data-appt-filter="' + f + '" style="padding:8px 14px;border:none;border-radius:6px;font-size:0.9rem;font-weight:600;cursor:pointer;background:'
          + (active ? 'var(--accent)' : 'transparent') + ';color:' + (active ? 'white' : 'var(--muted)') + '">' + label + '</button>';
      }).join('');

      // ── Edit details form ────────────────────────────────────────────
      var editFormHtml = '';
      if (editAppt) {
        editFormHtml = '<div style="border:1px solid var(--accent);border-radius:10px;padding:20px;margin-bottom:16px;background:var(--accent-lite)">'
          + '<h4 style="margin:0 0 16px;font-size:0.95rem;font-weight:600">Edit appointment details</h4>'
          + '<form id="edit-appt-form">'
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
          + '<div class="form-group"><label>Client name</label><input name="clientName" type="text" value="' + esc(editAppt.clientName || '') + '" style="width:100%" /></div>'
          + '<div class="form-group"><label>Client email</label><input name="clientEmail" type="email" value="' + esc(editAppt.clientEmail || '') + '" style="width:100%" /></div>'
          + '</div>'
          + '<div class="form-group"><label>Phone <span style="font-weight:400;color:var(--muted)">(optional)</span></label><input name="clientPhone" type="tel" value="' + esc(editAppt.clientPhone || '') + '" style="width:100%" /></div>'
          + '<div class="form-group"><label>Notes <span style="font-weight:400;color:var(--muted)">(optional)</span></label><textarea name="notes" style="width:100%">' + esc(editAppt.notes || '') + '</textarea></div>'
          + (S.apptActionError ? '<div class="alert-error">' + esc(S.apptActionError) + '</div>' : '')
          + '<div style="display:flex;gap:10px">'
          + '<button class="btn" type="submit"' + (S.apptActionSaving ? ' disabled' : '') + '>' + (S.apptActionSaving ? '<span class="spinner spinner-sm"></span> Saving…' : 'Save changes') + '</button>'
          + '<button class="btn btn-ghost" type="button" id="appt-edit-cancel">Cancel</button>'
          + '</div>'
          + '</form>'
          + '</div>';
      }

      // ── Reschedule form ──────────────────────────────────────────────
      var reschedFormHtml = '';
      if (reschedAppt) {
        var rTz = reschedAppt.timezone || S.tz;
        reschedFormHtml = '<div style="border:1px solid var(--accent);border-radius:10px;padding:20px;margin-bottom:16px;background:var(--accent-lite)">'
          + '<h4 style="margin:0 0 16px;font-size:0.95rem;font-weight:600">Reschedule appointment</h4>'
          + '<p style="margin:0 0 12px;font-size:0.85rem;color:var(--muted)">Current: ' + esc(fmtYmdInTimezone(reschedAppt.startTime, rTz) + ' ' + fmtTimeInTimezone(reschedAppt.startTime, rTz) + ' (' + rTz + ')') + '</p>'
          + '<form id="reschedule-appt-form">'
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
          + '<div class="form-group"><label>New date</label><input name="reschedDate" type="date" value="' + esc(fmtYmdInTimezone(reschedAppt.startTime, rTz)) + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px" /></div>'
          + '<div class="form-group"><label>New start time</label><input name="reschedTime" type="time" value="' + esc(fmtTimeInTimezone(reschedAppt.startTime, rTz)) + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px" /></div>'
          + '</div>'
          + (S.apptActionError ? '<div class="alert-error">' + esc(S.apptActionError) + '</div>' : '')
          + '<div style="display:flex;gap:10px">'
          + '<button class="btn" type="submit"' + (S.apptActionSaving ? ' disabled' : '') + '>' + (S.apptActionSaving ? '<span class="spinner spinner-sm"></span> Moving…' : 'Move appointment') + '</button>'
          + '<button class="btn btn-ghost" type="button" id="appt-reschedule-cancel">Cancel</button>'
          + '</div>'
          + '</form>'
          + '</div>';
      }

      // ── Add appointment form ─────────────────────────────────────────
      var addFormHtml = '';
      if (S.addingAppt) {
        addFormHtml = '<div style="border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:16px;background:var(--accent-lite)">'
          + '<h4 style="margin:0 0 16px;font-size:0.95rem;font-weight:600">New appointment</h4>'
          + '<form id="new-appt-form">'
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
          + '<div class="form-group"><label>Client name <span style="color:var(--accent)">*</span></label><input name="clientName" type="text" required style="width:100%" /></div>'
          + '<div class="form-group"><label>Client email <span style="color:var(--accent)">*</span></label><input name="clientEmail" type="email" required style="width:100%" /></div>'
          + '</div>'
          + '<div class="form-group"><label>Phone <span style="font-weight:400;color:var(--muted)">(optional)</span></label><input name="clientPhone" type="tel" style="width:100%" /></div>'
          + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">'
          + '<div class="form-group"><label>Date <span style="color:var(--accent)">*</span></label><input name="apptDate" type="date" required style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px" /></div>'
          + '<div class="form-group"><label>Start time <span style="color:var(--accent)">*</span></label><input name="apptTime" type="time" required style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px" /></div>'
          + '<div class="form-group"><label>Duration (min)</label><input name="apptDuration" type="number" min="15" max="480" value="' + (S.duration || 60) + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px" /></div>'
          + '</div>'
          + '<div class="form-group"><label>Notes <span style="font-weight:400;color:var(--muted)">(optional)</span></label><textarea name="notes" style="width:100%"></textarea></div>'
          + (S.apptActionError ? '<div class="alert-error">' + esc(S.apptActionError) + '</div>' : '')
          + '<div style="display:flex;gap:10px">'
          + '<button class="btn" type="submit"' + (S.apptActionSaving ? ' disabled' : '') + '>' + (S.apptActionSaving ? '<span class="spinner spinner-sm"></span> Adding…' : 'Add appointment') + '</button>'
          + '<button class="btn btn-ghost" type="button" id="appt-add-cancel">Cancel</button>'
          + '</div>'
          + '</form>'
          + '</div>';
      }

      // ── Appointments table ───────────────────────────────────────────
      var tableHtml = '';
      if (S.appointmentsLoading) {
        tableHtml = '<p style="color:var(--muted);font-size:0.9rem"><span class="spinner spinner-sm"></span> Loading appointments…</p>';
      } else if (S.appointmentsError) {
        tableHtml = '<div class="alert-error">' + esc(S.appointmentsError) + '</div>';
      } else if (filtered.length === 0) {
        tableHtml = '<p style="color:var(--muted);font-size:0.9rem">No'
          + (S.appointmentsFilter === 'upcoming' ? ' upcoming' : S.appointmentsFilter === 'past' ? ' past' : '')
          + ' appointments found.</p>';
      } else {
        tableHtml = '<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">'
          + '<table style="width:100%;border-collapse:collapse;font-size:0.88rem">'
          + '<thead style="background:var(--accent-lite);border-bottom:1px solid var(--border)">'
          + '<tr>'
          + '<th style="padding:10px 16px;text-align:left;font-weight:600">Date &amp; Time</th>'
          + '<th style="padding:10px 16px;text-align:left;font-weight:600">Client</th>'
          + '<th style="padding:10px 16px;text-align:left;font-weight:600">Status</th>'
          + '<th style="padding:10px 16px;text-align:left;font-weight:600">Actions</th>'
          + '</tr>'
          + '</thead>'
          + '<tbody>'
          + filtered.map(function(appt) {
              var tz = appt.timezone || S.tz;
              var dateStr = fmtYmdInTimezone(appt.startTime, tz) + ' ' + fmtTimeInTimezone(appt.startTime, tz);
              var isCancelled = appt.status === 'cancelled';
              var statusBg    = isCancelled ? '#fee2e2' : 'var(--accent-lite)';
              var statusColor = isCancelled ? '#dc2626' : '#0f766e';
              return '<tr style="border-bottom:1px solid var(--border)">'
                + '<td style="padding:10px 16px"><code style="font-size:0.82rem">' + esc(dateStr) + '</code>'
                + '<br><span style="font-size:0.75rem;color:var(--muted)">' + esc(tz) + '</span></td>'
                + '<td style="padding:10px 16px">'
                + '<div style="font-weight:600">' + esc(appt.clientName || '—') + '</div>'
                + '<div style="font-size:0.8rem;color:var(--muted)">' + esc(appt.clientEmail || '') + '</div>'
                + '</td>'
                + '<td style="padding:10px 16px"><span style="background:' + statusBg + ';color:' + statusColor + ';padding:3px 8px;border-radius:4px;font-size:0.8rem;font-weight:600">' + esc(appt.status || 'unknown') + '</span></td>'
                + '<td style="padding:10px 16px;white-space:nowrap">'
                + (!isCancelled ? '<button class="btn btn-ghost" style="padding:4px 8px;font-size:0.8rem;margin-right:4px" data-edit-appt-id="' + esc(appt.id) + '">Edit</button>' : '')
                + (!isCancelled ? '<button class="btn btn-ghost" style="padding:4px 8px;font-size:0.8rem;margin-right:4px" data-reschedule-appt-id="' + esc(appt.id) + '">Move</button>' : '')
                + (!isCancelled ? '<button class="btn btn-ghost" style="padding:4px 8px;font-size:0.8rem;color:#dc2626" data-cancel-appt-id="' + esc(appt.id) + '">Cancel</button>' : '')
                + '</td>'
                + '</tr>';
            }).join('')
          + '</tbody>'
          + '</table>'
          + '</div>';
      }

      return '<div class="card">'
        + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">'
        + '<button class="btn btn-ghost" id="appointments-back" style="padding:8px 14px">&#8592; Back</button>'
        + '<div><span class="chip">Appointments</span>'
        + '<h2 style="margin:4px 0 0">' + esc(org.name) + '</h2></div>'
        + '</div>'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">'
        + '<div style="display:flex;background:white;border:1px solid var(--border);border-radius:8px;padding:3px;gap:3px">' + filterTabs + '</div>'
        + '<button class="btn" id="appt-add-toggle">' + (S.addingAppt ? '&#10005; Close' : '+ Add appointment') + '</button>'
        + '</div>'
        + (S.apptActionMessage ? '<p style="color:var(--accent);font-weight:600;margin-bottom:12px">' + esc(S.apptActionMessage) + '</p>' : '')
        + editFormHtml
        + reschedFormHtml
        + addFormHtml
        + tableHtml
        + '</div>';
    }

    function tmplAdmin() {
      return '<div class="card">'
        + tmplEmailBanner()
        + '<span class="chip">Admin</span>'
        + '<h2>Your workspace</h2>'
        + '<p><strong style="font-size:0.95rem">User ID:</strong> <code style="display:block;background:var(--accent-lite);padding:8px;border-radius:6px;margin-top:4px;font-family:monospace;font-size:0.85rem">' + esc(S.userId) + '</code></p>'
        + '<p style="margin-top:20px;color:var(--muted)">Manage your organizations below. Use the settings panel for team management, schedule configuration, and branding.</p>'
        + '<div class="org-select-list">' + tmplAdminOrgList(true) + '</div>'
        + '<div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border)">'
        + '<p style="font-size:0.88rem;color:var(--muted)">Need help? <a href="' + resolveBrowserApiBase() + '/api/auth/logout" style="color:var(--accent)">Sign out</a></p>'
        + '</div>'
        + '</div>';
    }

    function tmplAdminEmpty() {
      var helper = '';
      if (S.intentChoice === 'appointment') {
        helper = '<div class="alert-error" style="background:#eff6ff;border-color:#bfdbfe;color:#1d4ed8">Please request a booking link from the vendor.</div>';
      }
      if (S.intentChoice === 'create-org') {
        helper = '<form id="create-org-form" style="margin-top:18px;text-align:left">'
          + '<div class="form-group">'
          + '<label for="org-name">Organization name</label>'
          + '<input id="org-name" name="name" type="text" placeholder="Acme Studio" required />'
          + '</div>'
          + '<button class="btn" type="submit"' + (S.creatingOrganization ? ' disabled' : '') + '>'
          + (S.creatingOrganization ? 'Creating...' : 'Create organization')
          + '</button>'
          + '</form>';
      }

      return '<div class="card center-card">'
        + tmplEmailBanner()
        + '<div class="icon">&#127968;</div>'
        + '<h2>No organization assigned yet</h2>'
        + '<p>Would you like to create an organization, or are you trying to make an appointment?</p>'
        + '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:18px">'
        + '<button class="btn btn-ghost" id="intent-appointment">Make an appointment</button>'
        + '<button class="btn" id="intent-create-org">Create an organization</button>'
        + '</div>'
        + (S.adminMessage ? '<p style="margin-top:16px;color:var(--accent)">' + esc(S.adminMessage) + '</p>' : '')
        + helper
        + '</div>';
    }

    function tmplOrgSelection() {
      var orgs = S.organizations || [];
      var options = orgs.map(function(org) {
        return '<button class="org-select-btn" data-org-id="' + esc(org.id) + '" data-org-slug="' + esc(org.slug) + '">'
          + '<div class="org-select-name">' + esc(org.name) + '</div>'
          + '<div class="org-select-meta">Role: ' + esc(org.role) + ' • ' + esc(org.slug) + '</div>'
          + '</button>';
      }).join('');

      return '<div class="card center-card">'
        + tmplEmailBanner()
        + '<div class="icon">&#127970;</div>'
        + '<h2>Select your organization</h2>'
        + '<p>Your account belongs to multiple organizations. Choose one to continue.</p>'
        + '<div class="org-select-list">' + options + '</div>'
        + '</div>';
    }

    function tmplError() {
      return '<div class="card center-card">'
        + '<div class="icon">&#128269;</div>'
        + '<h2>Something went wrong</h2>'
        + '<p>' + esc(S.error || 'An unexpected error occurred.') + '</p>'
        + '<button class="btn btn-ghost" onclick="history.back()">Go back</button>'
        + '</div>';
    }

    function tmplNoAvailability() {
      return '<div class="card center-card">'
        + '<div class="icon">&#9203;</div>'
        + '<h2>No available slots available.</h2>'
        + '<p>Please try again later or contact your host for additional availability.</p>'
        + '</div>';
    }

    function tmplOrgHeader() {
      var org   = S.org;
      var init  = org.name ? org.name[0].toUpperCase() : '?';
      var avatar = org.logoUrl
        ? '<img src="' + esc(org.logoUrl) + '" alt="" />'
        : init;
      return '<div class="org-header">'
        + '<div class="org-avatar">' + avatar + '</div>'
        + '<div>'
        + '<div class="org-name">' + esc(org.name) + '</div>'
        + (org.description ? '<div class="org-desc">' + esc(org.description) + '</div>' : '')
        + '</div>'
        + '</div>';
    }

    function tmplCalendar() {
      var year  = S.month.getFullYear();
      var month = S.month.getMonth();
      var today = todayYMD();
      var total = new Date(year, month + 1, 0).getDate();
      var start = new Date(year, month, 1).getDay();

      var cells = ['Su','Mo','Tu','We','Th','Fr','Sa'].map(function(d) {
        return '<div class="cal-dow">' + d + '</div>';
      }).join('');

      for (var e = 0; e < start; e++) cells += '<div class="cal-cell empty"></div>';

      for (var d = 1; d <= total; d++) {
        var ymd  = buildYMD(year, month, d);
        var past = ymd < today;
        var hasKnownAvailability = Object.prototype.hasOwnProperty.call(S.availabilityByDay, ymd);
        var available = S.availabilityByDay[ymd] === true;
        var loadingAvailability = !past && !hasKnownAvailability && S.availabilityLoading;
        var unavailable = !past && hasKnownAvailability && !available;
        var disabled = past || loadingAvailability || unavailable;
        var cls  = 'cal-cell'
          + (past          ? ' past'  : '')
          + (loadingAvailability ? ' loading' : '')
          + (unavailable ? ' unavailable' : '')
          + (ymd === today ? ' today' : '')
          + (ymd === S.day ? ' sel'   : '');
        cells += '<div class="' + cls + '"' + (!disabled ? ' data-day="' + ymd + '"' : '') + '>' + d + '</div>';
      }

      var slotsHtml = '';
      if (S.step === 'slot-loading') {
        slotsHtml = '<div class="slots-section"><div class="spinner-wrap"><div class="spinner"></div></div></div>';
      } else if (S.step === 'slots') {
        slotsHtml = tmplSlots();
      }

      var now          = new Date();
      var prevDisabled = (S.month.getFullYear() === now.getFullYear() && S.month.getMonth() <= now.getMonth())
        ? ' style="opacity:0.35;pointer-events:none"' : '';

      return '<div class="card">'
        + tmplEmailBanner()
        + tmplOrgHeader()
        + '<span class="chip">Pick a date</span>'
        + '<div class="cal-nav">'
        + '<button class="cal-nav-btn" id="prev-month"' + prevDisabled + '>&#8249;</button>'
        + '<span class="cal-month-label">' + monthLabel() + '</span>'
        + '<button class="cal-nav-btn" id="next-month">&#8250;</button>'
        + '</div>'
        + '<div class="cal-tz">Times shown in ' + esc(S.tz) + '</div>'
        + '<div class="cal-grid">' + cells + '</div>'
        + slotsHtml
        + '</div>';
    }

    function tmplSlots() {
      var label = S.day
        ? new Date(S.day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : '';

      if (!S.slots || S.slots.length === 0) {
        return '<div class="slots-section">'
          + '<div class="slots-date-label">' + esc(label) + '</div>'
          + '<div class="no-slots">No available times on this date. Try another day.</div>'
          + '</div>';
      }

      var btns = S.slots.map(function(slot) {
        return '<button class="slot-btn" data-start="' + esc(slot.startTime) + '" data-end="' + esc(slot.endTime) + '">'
          + fmtTime(slot.startTime)
          + '</button>';
      }).join('');

      return '<div class="slots-section">'
        + '<div class="slots-date-label">Available times &mdash; ' + esc(label) + '</div>'
        + '<div class="slots-grid">' + btns + '</div>'
        + '</div>';
    }

    function tmplForm() {
      var slotLabel = S.slot
        ? fmtDate(S.slot.startTime) + ' at ' + fmtTime(S.slot.startTime) + ' &ndash; ' + fmtTime(S.slot.endTime)
        : '';
      var loading  = S.step === 'submitting';
      var errHtml  = S.formError
        ? '<div class="alert-error">' + esc(S.formError) + '</div>'
        : '';

      return '<div class="card">'
        + tmplEmailBanner()
        + tmplOrgHeader()
        + '<button class="back-link" id="back-to-slots">&#8592; Pick a different time</button>'
        + '<span class="chip">Your details</span>'
        + '<div class="slot-summary">'
        + '<strong>' + slotLabel + '</strong>'
        + 'Duration: ' + S.duration + ' minutes'
        + '</div>'
        + errHtml
        + '<form id="booking-form" novalidate>'
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label for="f-name">Full name <span style="color:var(--accent)">*</span></label>'
        + '<input id="f-name" name="name" type="text" required autocomplete="name" />'
        + '</div>'
        + '<div class="form-group">'
        + '<label for="f-email">Email address <span style="color:var(--accent)">*</span></label>'
        + '<input id="f-email" name="email" type="email" required autocomplete="email" />'
        + '</div>'
        + '</div>'
        + '<div class="form-group">'
        + '<label for="f-phone">Phone <span style="font-size:0.8em;text-transform:none">(optional)</span></label>'
        + '<input id="f-phone" name="phone" type="tel" autocomplete="tel" />'
        + '</div>'
        + '<div class="form-group">'
        + '<label for="f-notes">Notes <span style="font-size:0.8em;text-transform:none">(optional)</span></label>'
        + '<textarea id="f-notes" name="notes" placeholder="Anything your host should know..."></textarea>'
        + '</div>'
        + '<div class="form-actions">'
        + '<button class="btn" type="submit"' + (loading ? ' disabled' : '') + '>'
        + (loading
            ? '<span class="spinner spinner-sm"></span> Booking&hellip;'
            : 'Confirm booking')
        + '</button>'
        + '</div>'
        + '</form>'
        + '</div>';
    }

    function tmplConfirmed() {
      var b   = S.booking;
      var org = S.org;

      var rows = b ? [
        ['Date',       fmtDate(b.startTime)],
        ['Time',       fmtTime(b.startTime) + ' &ndash; ' + fmtTime(b.endTime)],
        ['Timezone',   esc(S.tz)],
        ['Booked for', esc(b.clientName || '')],
      ].map(function(r) {
        return '<div class="booking-detail-row">'
          + '<span class="bd-key">' + r[0] + '</span>'
          + '<span class="bd-val">'  + r[1] + '</span>'
          + '</div>';
      }).join('') : '';

      var orgName = org ? esc(org.name) : 'TimePilot';
      var again   = (org && S.userId)
        ? '/?org=' + encodeURIComponent(org.slug) + '&user=' + encodeURIComponent(S.userId) + '&duration=' + S.duration
        : '/';

      return '<div class="card confirmed-body">'
        + tmplEmailBanner()
        + '<div class="confirmed-icon">&#10003;</div>'
        + '<h1>You&rsquo;re confirmed!</h1>'
        + '<p>Your appointment with <strong>' + orgName + '</strong> has been scheduled.</p>'
        + '<div class="booking-detail">' + rows + '</div>'
        + '<p style="font-size:0.85rem;color:var(--muted);margin-bottom:6px">Confirmation reference</p>'
        + '<div style="margin-bottom:28px">'
        + '<span class="ref-code" id="ref-code">' + esc(b ? b.confirmationRef : '') + '</span>'
        + '<span style="font-size:0.78rem;color:var(--muted);margin-left:8px">click to copy</span>'
        + '</div>'
        + '<a href="' + again + '" class="btn btn-ghost">Book another</a>'
        + '</div>';
    }

    // ─── Event delegation (registered once at startup) ───────────────
    document.addEventListener('click', function(e) {
      if (e.target && e.target.id === 'intent-appointment') {
        S.intentChoice = 'appointment';
        S.adminMessage = null;
        render();
        return;
      }

      if (e.target && e.target.id === 'intent-create-org') {
        S.intentChoice = 'create-org';
        S.adminMessage = null;
        render();
        return;
      }

      var orgSelectBtn = e.target && e.target.closest('[data-org-id][data-org-slug]');
      if (orgSelectBtn) {
        if (S.selectingOrganization) return;
        S.selectingOrganization = true;

        var selectedOrgId = orgSelectBtn.getAttribute('data-org-id');
        var selectedOrgSlug = orgSelectBtn.getAttribute('data-org-slug');
        apiFetch('/api/auth/organizations/select', {
          method: 'POST',
          body: { organizationId: selectedOrgId },
        }).then(function() {
          location.replace('/admin?org=' + encodeURIComponent(selectedOrgSlug));
        }).catch(function(err) {
          S.selectingOrganization = false;
          S.error = (err && err.message) || 'Failed to switch organization';
          S.step = 'error';
          render();
        });
        return;
      }

      var dayEl = e.target.closest('[data-day]');
      if (dayEl) { loadSlots(dayEl.getAttribute('data-day')); return; }

      var slotEl = e.target.closest('[data-start][data-end]');
      if (slotEl) {
        S.slot = { startTime: slotEl.getAttribute('data-start'), endTime: slotEl.getAttribute('data-end') };
        S.formError = null; S.step = 'form'; render(); return;
      }

      if (e.target.id === 'prev-month') {
        S.month.setMonth(S.month.getMonth() - 1);
        S.day = null; S.slots = []; S.step = 'calendar'; render();
        loadMonthAvailability();
        return;
      }
      if (e.target.id === 'next-month') {
        S.month.setMonth(S.month.getMonth() + 1);
        S.day = null; S.slots = []; S.step = 'calendar'; render();
        loadMonthAvailability();
        return;
      }
      if (e.target.id === 'back-to-slots') {
        S.step = (S.slots && S.slots.length > 0) ? 'slots' : 'calendar';
        S.formError = null; render(); return;
      }
      if (e.target.id === 'ref-code') {
        copyRef(e.target); return;
      }

      // Booking links — generate
      if (e.target && e.target.id === 'generate-booking-link') {
        if (S.linkGenerating || !S.settingsOrg) return;
        S.linkGenerating = true;
        S.linkGenerateError = null;
        render();
        apiFetch('/api/organizations/' + S.settingsOrg.id + '/booking-links', {
          method: 'POST',
          body: { userId: S.userId, label: S.settingsOrg.name + ' booking' },
        }).then(function(newLink) {
          S.bookingLinks = [newLink].concat(S.bookingLinks || []);
          S.linkGenerating = false;
          render();
        }).catch(function(err) {
          S.linkGenerating = false;
          S.linkGenerateError = (err && err.message) || 'Failed to generate link';
          render();
        });
        return;
      }

      // Booking links — copy URL to clipboard
      var copyBtn = e.target && e.target.closest('[data-copy-link]');
      if (copyBtn) {
        var copyUrl = copyBtn.getAttribute('data-copy-link');
        if (copyUrl && navigator.clipboard) {
          navigator.clipboard.writeText(copyUrl).then(function() {
            copyBtn.textContent = 'Copied!';
            setTimeout(function() { copyBtn.textContent = 'Copy'; }, 2000);
          });
        }
        return;
      }

      // Booking links — toggle QR code visibility
      var qrBtn = e.target && e.target.closest('[data-toggle-qr]');
      if (qrBtn) {
        var qrToken = qrBtn.getAttribute('data-toggle-qr');
        var qrEl = document.getElementById('qr-' + qrToken);
        if (qrEl) {
          qrEl.style.display = qrEl.style.display === 'none' ? 'block' : 'none';
          qrBtn.textContent = qrEl.style.display === 'none' ? 'QR' : 'Hide QR';
        }
        return;
      }

      // Booking links — delete
      var deleteBtn = e.target && e.target.closest('[data-delete-link-id]');
      if (deleteBtn) {
        var deleteLinkId = deleteBtn.getAttribute('data-delete-link-id');
        if (!S.settingsOrg || !deleteLinkId) return;
        apiFetch('/api/organizations/' + S.settingsOrg.id + '/booking-links/' + deleteLinkId, {
          method: 'DELETE',
        }).then(function() {
          S.bookingLinks = (S.bookingLinks || []).filter(function(lnk) { return lnk.id !== deleteLinkId; });
          render();
        }).catch(function(err) {
          S.linkGenerateError = (err && err.message) || 'Failed to delete link';
          render();
        });
        return;
      }

      // Availability — delete
      var deleteAvailBtn = e.target && e.target.closest('[data-delete-avail-id]');
      if (deleteAvailBtn) {
        var deleteAvailId = deleteAvailBtn.getAttribute('data-delete-avail-id');
        if (!S.settingsOrg || !deleteAvailId) return;
        apiFetch('/api/organizations/' + S.settingsOrg.id + '/availability/' + deleteAvailId, {
          method: 'DELETE',
        }).then(function() {
          S.availabilities = (S.availabilities || []).filter(function(a) { return a.id !== deleteAvailId; });
          S.availabilityMessage = 'Availability deleted';
          render();
          setTimeout(function() { S.availabilityMessage = null; render(); }, 3000);
        }).catch(function(err) {
          S.availabilityError = (err && err.message) || 'Failed to delete availability';
          render();
        });
        return;
      }

      // Availability — mode toggle (Recurring / One-time)
      var availModeBtn = e.target && e.target.closest('[data-avail-mode]');
      if (availModeBtn) {
        S.newAvailabilityMode = availModeBtn.getAttribute('data-avail-mode');
        S.newAvailabilityStartDate = '';
        S.newAvailabilityEndDate = '';
        render();
        return;
      }

      // Settings panel — back button
      if (e.target && e.target.id === 'settings-back') {
        S.step = 'admin';
        render();
        return;
      }

      // Settings panel — open from org card
      var settingsBtn = e.target && e.target.closest('[data-settings-org-id]');
      if (settingsBtn) {
        var settingsOrgId = settingsBtn.getAttribute('data-settings-org-id');
        var foundOrg = (S.organizations || []).find(function(o) { return o.id === settingsOrgId; });
        if (!foundOrg) return;
        S.settingsOrg = foundOrg;
        S.settingsError = null;
        S.settingsMessage = null;
        S.profileError = null;
        S.profileMessage = null;
        S.step = 'admin-settings';
        S.bookingLinksLoading = true;
        S.availabilitiesLoading = true;
        S.availabilityError = null;
        S.availabilityMessage = null;
        render();
        Promise.all([
          apiFetch('/api/organizations/' + settingsOrgId + '/admin/dashboard'),
          apiFetch('/api/users/me'),
          apiFetch('/api/organizations/' + settingsOrgId + '/booking-links'),
          apiFetch('/api/organizations/' + settingsOrgId + '/availability'),
        ]).then(function(results) {
          S.settingsOrg = results[0].organization || S.settingsOrg;
          S.userProfile = results[1];
          S.bookingLinks = results[2] || [];
          S.availabilities = results[3] || [];
          S.bookingLinksLoading = false;
          S.availabilitiesLoading = false;
          render();
        }).catch(function() { S.bookingLinksLoading = false; S.availabilitiesLoading = false; render(); });
        return;
      }

      // Appointments page — open from org card
      var appointmentsBtn = e.target && e.target.closest('[data-appointments-org-id]');
      if (appointmentsBtn) {
        var appointmentsOrgId = appointmentsBtn.getAttribute('data-appointments-org-id');
        var apptOrg = (S.organizations || []).find(function(o) { return o.id === appointmentsOrgId; });
        if (!apptOrg) return;
        S.appointmentsOrg = apptOrg;
        S.appointments = [];
        S.appointmentsFilter = 'upcoming';
        S.editingApptId = null;
        S.rescheduleApptId = null;
        S.apptActionError = null;
        S.apptActionMessage = null;
        S.addingAppt = false;
        S.step = 'admin-appointments';
        render();
        loadAdminAppointments(appointmentsOrgId);
        return;
      }

      // Appointments page — back button
      if (e.target && e.target.id === 'appointments-back') {
        S.step = 'admin';
        S.appointmentsOrg = null;
        S.appointments = [];
        S.editingApptId = null;
        S.rescheduleApptId = null;
        S.apptActionError = null;
        S.apptActionMessage = null;
        S.addingAppt = false;
        render();
        return;
      }

      // Appointments page — filter tabs
      var apptFilterBtn = e.target && e.target.closest('[data-appt-filter]');
      if (apptFilterBtn) {
        S.appointmentsFilter = apptFilterBtn.getAttribute('data-appt-filter');
        S.editingApptId = null;
        S.rescheduleApptId = null;
        S.apptActionError = null;
        render();
        return;
      }

      // Appointments page — add toggle / cancel
      if (e.target && e.target.id === 'appt-add-toggle') {
        S.addingAppt = !S.addingAppt;
        S.apptActionError = null;
        render();
        return;
      }
      if (e.target && e.target.id === 'appt-add-cancel') {
        S.addingAppt = false;
        S.apptActionError = null;
        render();
        return;
      }

      // Appointments page — toggle edit form
      var editApptBtn = e.target && e.target.closest('[data-edit-appt-id]');
      if (editApptBtn) {
        var editApptId = editApptBtn.getAttribute('data-edit-appt-id');
        S.editingApptId = (S.editingApptId === editApptId) ? null : editApptId;
        S.rescheduleApptId = null;
        S.apptActionError = null;
        render();
        return;
      }
      if (e.target && e.target.id === 'appt-edit-cancel') {
        S.editingApptId = null;
        S.apptActionError = null;
        render();
        return;
      }

      // Appointments page — toggle reschedule form
      var reschedApptBtn = e.target && e.target.closest('[data-reschedule-appt-id]');
      if (reschedApptBtn) {
        var reschedApptId = reschedApptBtn.getAttribute('data-reschedule-appt-id');
        S.rescheduleApptId = (S.rescheduleApptId === reschedApptId) ? null : reschedApptId;
        S.editingApptId = null;
        S.apptActionError = null;
        render();
        return;
      }
      if (e.target && e.target.id === 'appt-reschedule-cancel') {
        S.rescheduleApptId = null;
        S.apptActionError = null;
        render();
        return;
      }

      // Appointments page — cancel appointment
      var cancelApptBtn = e.target && e.target.closest('[data-cancel-appt-id]');
      if (cancelApptBtn) {
        var cancelApptId = cancelApptBtn.getAttribute('data-cancel-appt-id');
        if (!S.appointmentsOrg || !cancelApptId) return;
        if (!confirm('Cancel this appointment? This cannot be undone.')) return;
        apiFetch('/api/organizations/' + S.appointmentsOrg.id + '/appointments/' + cancelApptId + '/cancel', {
          method: 'POST', body: {},
        }).then(function() {
          S.appointments = (S.appointments || []).map(function(a) {
            return a.id === cancelApptId ? Object.assign({}, a, { status: 'cancelled' }) : a;
          });
          S.apptActionMessage = 'Appointment cancelled';
          render();
          setTimeout(function() { S.apptActionMessage = null; render(); }, 3000);
        }).catch(function(err) {
          S.apptActionError = (err && err.message) || 'Failed to cancel appointment';
          render();
        });
        return;
      }
    });

    document.addEventListener('change', function(e) {
      // Availability form — date inputs (field ids vary by mode)
      if (e.target && (e.target.id === 'avail-from-date' || e.target.id === 'avail-date')) {
        S.newAvailabilityStartDate = e.target.value;
        return;
      }
      if (e.target && e.target.id === 'avail-until-date') {
        S.newAvailabilityEndDate = e.target.value;
        return;
      }

      // Availability form — time inputs
      if (e.target && e.target.id === 'avail-start') {
        S.newAvailabilityStartTime = e.target.value;
        return;
      }
      if (e.target && e.target.id === 'avail-end') {
        S.newAvailabilityEndTime = e.target.value;
        return;
      }

      // Availability form — buffer minutes
      if (e.target && e.target.id === 'avail-buffer') {
        S.newAvailabilityBufferMinutes = parseInt(e.target.value || 0, 10);
        return;
      }

      // Availability form — days of week
      if (e.target && e.target.name === 'dayOfWeek') {
        S.newAvailabilityDaysOfWeek = Array.from(document.querySelectorAll('[name="dayOfWeek"]:checked')).map(function(el) {
          return parseInt(el.value, 10);
        });
        return;
      }
    });

    document.addEventListener('submit', function(e) {
      // Org branding / settings form
      if (e.target && e.target.id === 'settings-org-form') {
        e.preventDefault();
        if (S.settingsSaving) return;
        var sf = e.target;
        var sb = {
          name:           sf.querySelector('[name="name"]').value.trim(),
          description:    sf.querySelector('[name="description"]').value.trim(),
          logoUrl:        sf.querySelector('[name="logoUrl"]').value.trim(),
          primaryColor:   sf.querySelector('[name="primaryColor"]').value,
          secondaryColor: sf.querySelector('[name="secondaryColor"]').value,
          fontFamily:     sf.querySelector('[name="fontFamily"]').value,
        };
        S.settingsSaving = true; S.settingsError = null; S.settingsMessage = null; render();
        apiFetch('/api/organizations/' + S.settingsOrg.id + '/admin/settings', { method: 'PATCH', body: sb })
          .then(function(updated) {
            S.settingsOrg = updated;
            S.organizations = (S.organizations || []).map(function(o) {
              return o.id === updated.id ? Object.assign({}, o, updated) : o;
            });
            S.settingsSaving = false; S.settingsMessage = 'Settings saved!'; render();
            setTimeout(function() { S.settingsMessage = null; render(); }, 3000);
          }).catch(function(err) {
            S.settingsSaving = false; S.settingsError = (err && err.message) || 'Failed to save settings'; render();
          });
        return;
      }

      // User profile form
      if (e.target && e.target.id === 'settings-profile-form') {
        e.preventDefault();
        if (S.profileSaving) return;
        var pf = e.target;
        var pb = {
          firstName: pf.querySelector('[name="firstName"]').value.trim(),
          lastName:  pf.querySelector('[name="lastName"]').value.trim(),
          timezone:  pf.querySelector('[name="timezone"]').value.trim(),
        };
        S.profileSaving = true; S.profileError = null; S.profileMessage = null; render();
        apiFetch('/api/users/me', { method: 'PATCH', body: pb })
          .then(function(updated) {
            S.userProfile = updated;
            S.profileSaving = false; S.profileMessage = 'Profile updated!'; render();
            setTimeout(function() { S.profileMessage = null; render(); }, 3000);
          }).catch(function(err) {
            S.profileSaving = false; S.profileError = (err && err.message) || 'Failed to save profile'; render();
          });
        return;
      }

      // Availability form submission
      if (e.target && e.target.id === 'availability-form') {
        e.preventDefault();
        if (S.newAvailabilitySaving || !S.settingsOrg) return;
        
        var af = e.target;
        var isRecurringSubmit = S.newAvailabilityMode !== 'one-time';
        var startTime = af.querySelector('[name="startTime"]').value;
        var endTime = af.querySelector('[name="endTime"]').value;
        var bufferMinutes = parseInt(af.querySelector('[name="bufferMinutes"]').value || 0, 10);
        var daysOfWeek = isRecurringSubmit
          ? Array.from(af.querySelectorAll('[name="dayOfWeek"]:checked')).map(function(el) { return parseInt(el.value, 10); })
          : undefined;
        var singleDate = !isRecurringSubmit ? (af.querySelector('[name="date"]') || {}).value : null;
        var fromDate = isRecurringSubmit ? (af.querySelector('[name="fromDate"]') || {}).value : null;
        var untilDate = isRecurringSubmit ? (af.querySelector('[name="untilDate"]') || {}).value : null;

        if (!startTime || !endTime) {
          S.availabilityError = 'Please fill in start and end time';
          render();
          return;
        }
        if (!isRecurringSubmit && !singleDate) {
          S.availabilityError = 'Please select a date';
          render();
          return;
        }
        if (isRecurringSubmit && (!daysOfWeek || daysOfWeek.length === 0)) {
          S.availabilityError = 'Select at least one day to repeat on';
          render();
          return;
        }

        // Convert local time to UTC using timezone context
        var userTz = (S.userProfile && S.userProfile.timezone) || S.tz;
        
        // Helper function to convert local time in timezone to UTC ISO string
        function convertToUTC(localDate, localTime, tz) {
          var parts = localDate.split('-').map(function(x) { return parseInt(x, 10); });
          var year = parts[0], month = parts[1], day = parts[2];
          var timeParts = localTime.split(':').map(function(x) { return parseInt(x, 10); });
          var hour = timeParts[0], minute = timeParts[1];
          
          var desiredUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
          var candidateUtcMs = desiredUtcMs;
          
          var formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          
          for (var i = 0; i < 3; i++) {
            var formatted = formatter.formatToParts(new Date(candidateUtcMs));
            var lookup = {};
            formatted.forEach(function(p) { lookup[p.type] = p.value; });
            
            var actualUtcMs = Date.UTC(
              parseInt(lookup.year, 10),
              parseInt(lookup.month, 10) - 1,
              parseInt(lookup.day, 10),
              parseInt(lookup.hour, 10),
              parseInt(lookup.minute, 10),
              0, 0
            );
            candidateUtcMs = desiredUtcMs - (actualUtcMs - desiredUtcMs);
          }
          
          return new Date(candidateUtcMs).toISOString();
        }
        
        var defaultDate = new Date().toISOString().slice(0, 10);
        var payloads = [];
        if (isRecurringSubmit) {
          var recurFromDate = fromDate || defaultDate;
          var defaultUntilDate = (function() {
            var parts = recurFromDate.split('-').map(function(x) { return parseInt(x, 10); });
            var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0));
            d.setUTCFullYear(d.getUTCFullYear() + 1);
            return d.toISOString().slice(0, 10);
          })();
          var recurUntilDate = untilDate || defaultUntilDate;
          payloads.push({
            type: 'week',
            startTime: convertToUTC(recurFromDate, startTime, userTz),
            endTime: convertToUTC(recurUntilDate, endTime, userTz),
            daysOfWeek: daysOfWeek,
            bufferMinutes: bufferMinutes,
            timezone: userTz,
          });
        } else {
          payloads.push({
            type: 'day',
            startTime: convertToUTC(singleDate, startTime, userTz),
            endTime: convertToUTC(singleDate, endTime, userTz),
            bufferMinutes: bufferMinutes,
            timezone: userTz,
          });
        }

        S.newAvailabilitySaving = true;
        S.availabilityError = null;
        S.availabilityMessage = null;
        render();

        Promise.all(payloads.map(function(payload) {
          return apiFetch('/api/organizations/' + S.settingsOrg.id + '/availability', {
            method: 'POST',
            body: payload,
          });
        })).then(function(newAvailabilities) {
          S.availabilities = (S.availabilities || []).concat(newAvailabilities || []);
          S.newAvailabilitySaving = false;
          S.availabilityMessage = 'Availability added';
          S.newAvailabilityMode = 'recurring';
          S.newAvailabilityStartDate = '';
          S.newAvailabilityEndDate = '';
          S.newAvailabilityStartTime = '09:00';
          S.newAvailabilityEndTime = '17:00';
          S.newAvailabilityDaysOfWeek = [1, 2, 3, 4, 5];
          S.newAvailabilityBufferMinutes = 0;
          render();
          setTimeout(function() { S.availabilityMessage = null; render(); }, 3000);
        }).catch(function(err) {
          S.newAvailabilitySaving = false;
          S.availabilityError = (err && err.message) || 'Failed to add availability';
          render();
        });
        return;
      }

      if (e.target && e.target.id === 'create-org-form') {
        e.preventDefault();
        if (S.creatingOrganization) return;
        var orgName = e.target.querySelector('[name="name"]').value.trim();
        if (!orgName) return;

        S.creatingOrganization = true;
        S.adminMessage = null;
        render();

        apiFetch('/api/auth/organizations/create', {
          method: 'POST',
          body: {
            name: orgName,
            timezone: S.tz,
          },
        }).then(function(data) {
          S.creatingOrganization = false;
          location.replace('/admin?org=' + encodeURIComponent(data.organizationSlug));
        }).catch(function(err) {
          S.creatingOrganization = false;
          S.adminMessage = (err && err.message) || 'Failed to create organization';
          render();
        });
        return;
      }

      // Edit appointment details
      if (e.target && e.target.id === 'edit-appt-form') {
        e.preventDefault();
        if (S.apptActionSaving || !S.appointmentsOrg || !S.editingApptId) return;
        var ef = e.target;
        var eb = {
          clientName:  ef.querySelector('[name="clientName"]').value.trim(),
          clientEmail: ef.querySelector('[name="clientEmail"]').value.trim(),
          clientPhone: ef.querySelector('[name="clientPhone"]').value.trim() || undefined,
          notes:       ef.querySelector('[name="notes"]').value.trim()       || undefined,
        };
        if (!eb.clientName || !eb.clientEmail) {
          S.apptActionError = 'Name and email are required';
          render();
          return;
        }
        S.apptActionSaving = true; S.apptActionError = null; render();
        apiFetch('/api/organizations/' + S.appointmentsOrg.id + '/appointments/' + S.editingApptId, {
          method: 'PATCH', body: eb,
        }).then(function(updated) {
          S.appointments = (S.appointments || []).map(function(a) { return a.id === updated.id ? updated : a; });
          S.apptActionSaving = false; S.editingApptId = null; S.apptActionMessage = 'Appointment updated'; render();
          setTimeout(function() { S.apptActionMessage = null; render(); }, 3000);
        }).catch(function(err) {
          S.apptActionSaving = false; S.apptActionError = (err && err.message) || 'Failed to update appointment'; render();
        });
        return;
      }

      // Reschedule appointment
      if (e.target && e.target.id === 'reschedule-appt-form') {
        e.preventDefault();
        if (S.apptActionSaving || !S.appointmentsOrg || !S.rescheduleApptId) return;
        var rf = e.target;
        var reschedDate = rf.querySelector('[name="reschedDate"]').value;
        var reschedTime = rf.querySelector('[name="reschedTime"]').value;
        if (!reschedDate || !reschedTime) {
          S.apptActionError = 'Please provide a new date and time';
          render();
          return;
        }
        var apptToResched = (S.appointments || []).find(function(a) { return a.id === S.rescheduleApptId; });
        if (!apptToResched) return;
        var origDurationMs = new Date(apptToResched.endTime) - new Date(apptToResched.startTime);
        var rTz = apptToResched.timezone || S.tz;
        var newStartTime = convertLocalToUTC(reschedDate, reschedTime, rTz);
        var newEndTime   = new Date(new Date(newStartTime).getTime() + origDurationMs).toISOString();
        if (hasAppointmentTimeConflict(newStartTime, newEndTime, S.rescheduleApptId)) {
          S.apptActionError = 'An appointment already exists in this time range. Choose a different time.';
          render();
          return;
        }
        S.apptActionSaving = true; S.apptActionError = null; render();
        apiFetch('/api/organizations/' + S.appointmentsOrg.id + '/appointments/' + S.rescheduleApptId + '/reschedule', {
          method: 'POST', body: { startTime: newStartTime, endTime: newEndTime, timezone: rTz },
        }).then(function(updated) {
          S.appointments = (S.appointments || []).map(function(a) { return a.id === updated.id ? updated : a; });
          S.apptActionSaving = false; S.rescheduleApptId = null; S.apptActionMessage = 'Appointment rescheduled'; render();
          setTimeout(function() { S.apptActionMessage = null; render(); }, 3000);
        }).catch(function(err) {
          S.apptActionSaving = false; S.apptActionError = (err && err.message) || 'Failed to reschedule appointment'; render();
        });
        return;
      }

      // New appointment (admin-side create)
      if (e.target && e.target.id === 'new-appt-form') {
        e.preventDefault();
        if (S.apptActionSaving || !S.appointmentsOrg) return;
        var nf = e.target;
        var nClientName  = nf.querySelector('[name="clientName"]').value.trim();
        var nClientEmail = nf.querySelector('[name="clientEmail"]').value.trim();
        var nClientPhone = nf.querySelector('[name="clientPhone"]').value.trim();
        var nApptDate    = nf.querySelector('[name="apptDate"]').value;
        var nApptTime    = nf.querySelector('[name="apptTime"]').value;
        var nDuration    = parseInt(nf.querySelector('[name="apptDuration"]').value || '60', 10);
        var nNotes       = nf.querySelector('[name="notes"]').value.trim();
        if (!nClientName || !nClientEmail || !nApptDate || !nApptTime) {
          S.apptActionError = 'Name, email, date and time are required';
          render();
          return;
        }
        if (!nDuration || !isFinite(nDuration) || nDuration < 15) {
          S.apptActionError = 'Duration must be at least 15 minutes';
          render();
          return;
        }
        var nTz        = (S.userProfile && S.userProfile.timezone) || S.tz;
        var nStart     = convertLocalToUTC(nApptDate, nApptTime, nTz);
        var nEnd       = new Date(new Date(nStart).getTime() + nDuration * 60000).toISOString();
        if (hasAppointmentTimeConflict(nStart, nEnd)) {
          S.apptActionError = 'An appointment already exists in this time range. Choose a different time.';
          render();
          return;
        }
        S.apptActionSaving = true; S.apptActionError = null; render();
        apiFetch('/api/organizations/' + S.appointmentsOrg.id + '/appointments', {
          method: 'POST',
          body: {
            userId:      S.userId,
            clientName:  nClientName,
            clientEmail: nClientEmail,
            clientPhone: nClientPhone || undefined,
            notes:       nNotes || undefined,
            startTime:   nStart,
            endTime:     nEnd,
            timezone:    nTz,
          },
        }).then(function(created) {
          S.appointments = [created].concat(S.appointments || []);
          S.apptActionSaving = false; S.addingAppt = false; S.apptActionMessage = 'Appointment added'; render();
          setTimeout(function() { S.apptActionMessage = null; render(); }, 3000);
        }).catch(function(err) {
          S.apptActionSaving = false; S.apptActionError = (err && err.message) || 'Failed to add appointment'; render();
        });
        return;
      }

      if (!e.target || e.target.id !== 'booking-form') return;
      e.preventDefault();
      var form  = e.target;
      var name  = form.querySelector('[name="name"]').value.trim();
      var email = form.querySelector('[name="email"]').value.trim();
      var phone = form.querySelector('[name="phone"]').value.trim();
      var notes = form.querySelector('[name="notes"]').value.trim();

      form.querySelectorAll('.invalid').forEach(function(el) { el.classList.remove('invalid'); });

      var ok = true;
      if (!name)                     { form.querySelector('[name="name"]').classList.add('invalid');  ok = false; }
      if (!email || email.indexOf('@') < 1) { form.querySelector('[name="email"]').classList.add('invalid'); ok = false; }
      if (!ok) return;

      bookAppointment({ name: name, email: email, phone: phone, notes: notes });
    });

    // ─── Start ───────────────────────────────────────────────────────
    boot();
  </script>
</body>
</html>`;

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Server — only started when this file is the process entry point.
// When imported by tests (to inspect BOOKING_HTML), no server is created.
// ─────────────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok', service: 'client' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(BOOKING_HTML);
  });

  server.listen(clientPort, () => {
    console.log(`TimePilot booking UI started on ${env.CLIENT_BASE_URL}`);
    console.log(`  Usage:   ${env.CLIENT_BASE_URL}/admin`);
    console.log(`  Direct:  ${env.CLIENT_BASE_URL}/?org=<slug>&user=<userId>`);
    console.log(`  Confirm: ${env.CLIENT_BASE_URL}/?ref=<confirmationRef>`);
  });

  process.on('SIGTERM', () => server.close());
  process.on('SIGINT',  () => server.close());
}
