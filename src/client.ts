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

const clientPort = Number(new URL(env.CLIENT_BASE_URL).port || 3001);

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
    };

    // ─── API helper ─────────────────────────────────────────────────
    function apiFetch(path, opts) {
      var url      = window.__TP.api + path;
      var fetchOpts = { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
      if (opts && opts.method) fetchOpts.method = opts.method;
      if (opts && opts.body)   fetchOpts.body   = JSON.stringify(opts.body);
      return fetch(url, fetchOpts).then(function(r) {
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

    function buildYMD(year, month, day) {
      return year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
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
        return window.__TP.api + providerPath + '?' + params.join('&');
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

      var enableUrl = window.__TP.api
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
          + '</div>'
          + '</div>';
      }).join('');
    }

    function tmplAdminSettings() {
      var org = S.settingsOrg;
      if (!org) return tmplLoading();
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
        + '<p style="font-size:0.88rem;color:var(--muted)">Need help? <a href="' + window.__TP.api + '/api/auth/logout" style="color:var(--accent)">Sign out</a></p>'
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
        render();
        Promise.all([
          apiFetch('/api/organizations/' + settingsOrgId + '/admin/dashboard'),
          apiFetch('/api/users/me'),
        ]).then(function(results) {
          S.settingsOrg = results[0].organization || S.settingsOrg;
          S.userProfile = results[1];
          render();
        }).catch(function() { render(); });
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
  const server = http.createServer((_req, res) => {
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
