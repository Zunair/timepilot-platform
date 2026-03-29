/**
 * Booking UI Smoke Tests
 *
 * Verifies the BOOKING_HTML export from client.ts contains all required
 * structural landmarks, security essentials, and SPA entry points.
 * No server is started — we inspect the static HTML string directly.
 */

import { describe, it, expect } from 'vitest';
import { BOOKING_HTML } from '../client.js';

describe('BOOKING_HTML structure', () => {
  it('is a non-empty string', () => {
    expect(typeof BOOKING_HTML).toBe('string');
    expect(BOOKING_HTML.length).toBeGreaterThan(100);
  });

  it('contains the SPA root mount point', () => {
    expect(BOOKING_HTML).toContain('id="app"');
  });

  it('injects server-side config into window.__TP', () => {
    expect(BOOKING_HTML).toContain('window.__TP =');
    expect(BOOKING_HTML).toContain('"api"');
    expect(BOOKING_HTML).toContain('"oauthProviders"');
  });

  it('includes a valid HTML5 doctype and lang attribute', () => {
    expect(BOOKING_HTML).toMatch(/^<!DOCTYPE html>/i);
    expect(BOOKING_HTML).toContain('lang="en"');
  });

  it('has mobile viewport meta tag', () => {
    expect(BOOKING_HTML).toContain('name="viewport"');
  });

  it('defines CSS custom properties (design tokens)', () => {
    expect(BOOKING_HTML).toContain('--accent');
    expect(BOOKING_HTML).toContain('--panel');
    expect(BOOKING_HTML).toContain('--bg');
  });
});

describe('BOOKING_HTML JavaScript SPA', () => {
  it('calls boot() to initialise the app', () => {
    expect(BOOKING_HTML).toContain('boot()');
  });

  it('implements core booking functions', () => {
    expect(BOOKING_HTML).toContain('function loadOrg(');
    expect(BOOKING_HTML).toContain('function loadSlots(');
    expect(BOOKING_HTML).toContain('function loadMonthAvailability(');
    expect(BOOKING_HTML).toContain('function ensureInitialAvailability(');
    expect(BOOKING_HTML).toContain('function bookAppointment(');
    expect(BOOKING_HTML).toContain('function loadByRef(');
  });

  it('includes all screen templates', () => {
    expect(BOOKING_HTML).toContain('function tmplAdmin(');
    expect(BOOKING_HTML).toContain('function tmplAdminEmpty(');
    expect(BOOKING_HTML).toContain('function tmplCalendar(');
    expect(BOOKING_HTML).toContain('function tmplNoAvailability(');
    expect(BOOKING_HTML).toContain('function tmplSlots(');
    expect(BOOKING_HTML).toContain('function tmplForm(');
    expect(BOOKING_HTML).toContain('function tmplConfirmed(');
    expect(BOOKING_HTML).toContain('function tmplWelcome(');
    expect(BOOKING_HTML).toContain('function tmplError(');
  });

  it('shows SSO buttons only from configured provider flags', () => {
    expect(BOOKING_HTML).toContain('window.__TP.oauthProviders');
    expect(BOOKING_HTML).toContain('Continue with Google');
    expect(BOOKING_HTML).toContain('Continue with Apple');
    expect(BOOKING_HTML).toContain('Continue with Microsoft');
    expect(BOOKING_HTML).toContain("new URLSearchParams(location.search).get('org')");
    expect(BOOKING_HTML).toContain("buildAuthHref('/api/auth/google/callback')");
  });

  it('falls back to same-origin browser API calls when configured API base is loopback', () => {
    expect(BOOKING_HTML).toContain('function resolveBrowserApiBase()');
    expect(BOOKING_HTML).toContain("!isLoopbackHost(location.hostname) && isLoopbackHost(configuredUrl.hostname)");
    expect(BOOKING_HTML).toContain("return location.origin;");
  });

  it('uses post-login org/session resolution when org and user query params are absent', () => {
    expect(BOOKING_HTML).toContain('loadSessionContext(selectOrg)');
    expect(BOOKING_HTML).toContain("apiFetch('/api/auth/session')");
    expect(BOOKING_HTML).toContain("apiFetch('/api/auth/organizations')");
    expect(BOOKING_HTML).toContain("S.step = 'admin'");
    expect(BOOKING_HTML).toContain("apiFetch('/api/auth/organizations/select'");
  });

  it('shows admin onboarding choices for users without an organization', () => {
    expect(BOOKING_HTML).toContain('No organization assigned yet');
    expect(BOOKING_HTML).toContain('intent-appointment');
    expect(BOOKING_HTML).toContain('intent-create-org');
    expect(BOOKING_HTML).toContain("Please request a booking link from the vendor.");
    expect(BOOKING_HTML).toContain("apiFetch('/api/auth/organizations/create'");
  });

  it('shows a simple admin workspace view with user id and organizations', () => {
    expect(BOOKING_HTML).toContain('Your workspace');
    expect(BOOKING_HTML).toContain('User ID:');
    expect(BOOKING_HTML).toContain('Booking link');
  });

  it('shows a deferred email-scope enable banner after login when Gmail scope is missing', () => {
    expect(BOOKING_HTML).toContain('function tmplEmailBanner(');
    expect(BOOKING_HTML).toContain('Email notifications are disabled because Gmail access is not enabled.');
    expect(BOOKING_HTML).toContain('/api/auth/google/enable-email-scope?returnTo=');
  });

  it('has XSS-prevention esc() helper', () => {
    expect(BOOKING_HTML).toContain('function esc(');
    expect(BOOKING_HTML).toContain('&amp;');
    expect(BOOKING_HTML).toContain('&lt;');
  });

  it('reads org/user/duration/ref query params', () => {
    expect(BOOKING_HTML).toContain("p.get('org')");
    expect(BOOKING_HTML).toContain("p.get('user')");
    expect(BOOKING_HTML).toContain("p.get('duration')");
    expect(BOOKING_HTML).toContain("p.get('ref')");
  });

  it('uses en-CA locale trick for YYYY-MM-DD date formatting', () => {
    expect(BOOKING_HTML).toContain("'en-CA'");
  });

  it('disables calendar days when month availability shows no slots', () => {
    expect(BOOKING_HTML).toContain('availabilityByDay');
    expect(BOOKING_HTML).toContain('Object.prototype.hasOwnProperty.call(S.availabilityByDay, ymd)');
    expect(BOOKING_HTML).toContain('var disabled = past || loadingAvailability || unavailable;');
    expect(BOOKING_HTML).toContain('cal-cell.unavailable');
    expect(BOOKING_HTML).toContain("' data-day=\"");
  });

  it('shows a dedicated no-availability state when no future dates are available', () => {
    expect(BOOKING_HTML).toContain("case 'no-availability':");
    expect(BOOKING_HTML).toContain('No available slots available.');
    expect(BOOKING_HTML).toContain("S.step = 'no-availability';");
  });

  it('auto-selects and loads the next available date during initial availability bootstrap', () => {
    expect(BOOKING_HTML).toContain('loadSlots(firstAvailableDay)');
    expect(BOOKING_HTML).toContain('probe(0)');
    expect(BOOKING_HTML).toContain('if (offset > 11)');
  });

  it('calls history.replaceState after successful booking', () => {
    expect(BOOKING_HTML).toContain('history.replaceState');
    expect(BOOKING_HTML).toContain('confirmationRef');
  });

  it('handles form submit with client-side validation', () => {
    expect(BOOKING_HTML).toContain('booking-form');
    expect(BOOKING_HTML).toContain('classList.add(\'invalid\')');
    expect(BOOKING_HTML).toContain('e.preventDefault()');
  });

  it('provides month navigation controls', () => {
    expect(BOOKING_HTML).toContain('id="prev-month"');
    expect(BOOKING_HTML).toContain('id="next-month"');
  });

  it('provides a "back to slots" escape from the form', () => {
    expect(BOOKING_HTML).toContain('id="back-to-slots"');
  });

  it('renders confirmation ref as a copyable element', () => {
    expect(BOOKING_HTML).toContain('id="ref-code"');
    expect(BOOKING_HTML).toContain('function copyRef(');
    expect(BOOKING_HTML).toContain('navigator.clipboard');
  });

  it('keeps booking-link generate handler separate from settings-back handler', () => {
    var clickSection = BOOKING_HTML.split("document.addEventListener('click', function(e) {")[1] || '';
    var settingsBackIndex = clickSection.indexOf("if (e.target && e.target.id === 'settings-back') {");
    var generateIndex = clickSection.indexOf("if (e.target && e.target.id === 'generate-booking-link') {");

    expect(generateIndex).toBeGreaterThan(-1);
    expect(settingsBackIndex).toBeGreaterThan(-1);
    expect(generateIndex).toBeLessThan(settingsBackIndex);
  });
});

describe('BOOKING_HTML API integration', () => {
  it('calls org slug endpoint', () => {
    expect(BOOKING_HTML).toContain('/api/organizations/slug/');
  });

  it('calls availability slots endpoint', () => {
    expect(BOOKING_HTML).toContain('/availability/slots');
  });

  it('unwraps data.slots from the slots API response envelope', () => {
    // The /availability/slots endpoint returns { date, timezone, slots: [...] }.
    // The client must read data.slots, not the whole response object, otherwise
    // S.slots.map() throws and the catch handler shows "No available times".
    expect(BOOKING_HTML).toContain('data.slots');
  });


  it('calls appointments create endpoint via POST', () => {
    expect(BOOKING_HTML).toContain('/appointments');
    expect(BOOKING_HTML).toContain("method: 'POST'");
  });

  it('calls appointment confirmation lookup endpoint', () => {
    expect(BOOKING_HTML).toContain('/api/appointments/confirm/');
  });

  it('sends required booking fields', () => {
    expect(BOOKING_HTML).toContain('clientName');
    expect(BOOKING_HTML).toContain('clientEmail');
    expect(BOOKING_HTML).toContain('startTime');
    expect(BOOKING_HTML).toContain('endTime');
    expect(BOOKING_HTML).toContain('timezone');
  });
});
