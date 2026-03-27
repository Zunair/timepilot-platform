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
    expect(BOOKING_HTML).toContain('function bookAppointment(');
    expect(BOOKING_HTML).toContain('function loadByRef(');
  });

  it('includes all screen templates', () => {
    expect(BOOKING_HTML).toContain('function tmplCalendar(');
    expect(BOOKING_HTML).toContain('function tmplSlots(');
    expect(BOOKING_HTML).toContain('function tmplForm(');
    expect(BOOKING_HTML).toContain('function tmplConfirmed(');
    expect(BOOKING_HTML).toContain('function tmplWelcome(');
    expect(BOOKING_HTML).toContain('function tmplError(');
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
});

describe('BOOKING_HTML API integration', () => {
  it('calls org slug endpoint', () => {
    expect(BOOKING_HTML).toContain('/api/organizations/slug/');
  });

  it('calls availability slots endpoint', () => {
    expect(BOOKING_HTML).toContain('/availability/slots');
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
