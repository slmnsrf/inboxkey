/**
 * Fixture Loader - Load and manage test fixtures
 *
 * Provides utilities for loading HTML sites and email JSON fixtures
 * used across the test suite.
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// Base paths
const FIXTURES_ROOT = path.join(__dirname, '../fixtures');
const SITES_ROOT = path.join(FIXTURES_ROOT, 'sites');
const EMAILS_ROOT = path.join(FIXTURES_ROOT, 'emails');

// Types
export interface EmailFixture {
  id: string;
  type: 'otp' | 'alphanumeric' | 'magic-link' | 'password-reset' | 'security-alert' | string;
  category: string;
  from: string;
  subject: string;
  body: string;
  extracted: {
    code?: string;
    link?: string;
    token?: string;
    pattern?: string;
    confidence?: 'high' | 'medium' | 'low';
    [key: string]: any;
  };
  metadata?: Record<string, any>;
}

export interface SiteFixture {
  path: string;
  category: string;
  name: string;
  html: string;
}

export interface ValidationResult {
  passed: number;
  failed: number;
  errors: Array<{ path: string; error: string }>;
}

/**
 * Load a single email fixture by path
 */
export async function loadEmailFixture(relativePath: string): Promise<EmailFixture> {
  const fullPath = path.join(EMAILS_ROOT, relativePath);

  try {
    const content = await readFile(fullPath, 'utf-8');
    const fixture = JSON.parse(content) as EmailFixture;

    // Validate required fields
    if (!fixture.id || !fixture.type || !fixture.from || !fixture.subject || !fixture.body) {
      throw new Error(`Invalid fixture: missing required fields in ${relativePath}`);
    }

    return fixture;
  } catch (error) {
    throw new Error(`Failed to load email fixture ${relativePath}: ${error.message}`);
  }
}

/**
 * Load a single HTML site fixture by path
 */
export async function loadSiteFixture(relativePath: string): Promise<SiteFixture> {
  const fullPath = path.join(SITES_ROOT, relativePath);

  try {
    const html = await readFile(fullPath, 'utf-8');
    const pathParts = relativePath.split('/');
    const category = pathParts[0];
    const name = pathParts[pathParts.length - 1].replace('.html', '');

    return {
      path: relativePath,
      category,
      name,
      html,
    };
  } catch (error) {
    throw new Error(`Failed to load site fixture ${relativePath}: ${error.message}`);
  }
}

/**
 * Load all fixtures from a directory
 */
export async function loadAllFixtures(
  type: 'emails' | 'sites',
  subPath?: string
): Promise<EmailFixture[] | SiteFixture[]> {
  const basePath = type === 'emails' ? EMAILS_ROOT : SITES_ROOT;
  const targetPath = subPath ? path.join(basePath, subPath) : basePath;

  const files = await getFilesRecursive(targetPath);
  const fixtures = [];

  for (const file of files) {
    const relativePath = path.relative(basePath, file);

    try {
      if (type === 'emails' && file.endsWith('.json')) {
        fixtures.push(await loadEmailFixture(relativePath));
      } else if (type === 'sites' && file.endsWith('.html')) {
        fixtures.push(await loadSiteFixture(relativePath));
      }
    } catch (error) {
      console.warn(`Warning: Failed to load ${relativePath}: ${error.message}`);
    }
  }

  return fixtures;
}

/**
 * Load all email fixtures by type
 */
export async function loadEmailsByType(
  type: 'otp' | 'alphanumeric' | 'magic-links' | 'password-resets' | 'security-alerts' | 'edge-cases'
): Promise<EmailFixture[]> {
  return await loadAllFixtures('emails', type) as EmailFixture[];
}

/**
 * Load all site fixtures by category
 */
export async function loadSitesByCategory(
  category: 'banking' | 'crypto' | 'ecommerce' | 'saas' | 'tech'
): Promise<SiteFixture[]> {
  return await loadAllFixtures('sites', category) as SiteFixture[];
}

/**
 * Get all files recursively from a directory
 */
async function getFilesRecursive(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        const subFiles = await getFilesRecursive(fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not read directory ${dir}: ${error.message}`);
  }

  return files;
}

/**
 * Validate all fixtures load without errors
 */
export async function validateAllFixtures(): Promise<ValidationResult> {
  const result: ValidationResult = {
    passed: 0,
    failed: 0,
    errors: [],
  };

  // Validate email fixtures
  const emailTypes = ['otp', 'alphanumeric', 'magic-links', 'password-resets', 'security-alerts', 'edge-cases'];

  for (const type of emailTypes) {
    try {
      const fixtures = await loadAllFixtures('emails', type);
      result.passed += fixtures.length;
    } catch (error) {
      result.failed++;
      result.errors.push({ path: `emails/${type}`, error: error.message });
    }
  }

  // Validate site fixtures
  const siteCategories = ['banking', 'crypto', 'ecommerce', 'saas', 'tech'];

  for (const category of siteCategories) {
    try {
      const fixtures = await loadAllFixtures('sites', category);
      result.passed += fixtures.length;
    } catch (error) {
      result.failed++;
      result.errors.push({ path: `sites/${category}`, error: error.message });
    }
  }

  return result;
}

/**
 * Find fixtures matching a pattern
 */
export async function findFixtures(
  type: 'emails' | 'sites',
  pattern: RegExp
): Promise<Array<EmailFixture | SiteFixture>> {
  const allFixtures = await loadAllFixtures(type);

  return allFixtures.filter((fixture) => {
    if ('html' in fixture) {
      return pattern.test(fixture.name) || pattern.test(fixture.html);
    } else {
      return pattern.test(fixture.id) || pattern.test(fixture.body);
    }
  });
}

/**
 * Get fixture statistics
 */
export async function getFixtureStats() {
  const stats = {
    emails: {
      total: 0,
      byType: {} as Record<string, number>,
    },
    sites: {
      total: 0,
      byCategory: {} as Record<string, number>,
    },
  };

  // Count email fixtures
  const emailTypes = ['otp', 'alphanumeric', 'magic-links', 'password-resets', 'security-alerts', 'edge-cases'];

  for (const type of emailTypes) {
    const fixtures = await loadAllFixtures('emails', type);
    stats.emails.byType[type] = fixtures.length;
    stats.emails.total += fixtures.length;
  }

  // Count site fixtures
  const siteCategories = ['banking', 'crypto', 'ecommerce', 'saas', 'tech'];

  for (const category of siteCategories) {
    const fixtures = await loadAllFixtures('sites', category);
    stats.sites.byCategory[category] = fixtures.length;
    stats.sites.total += fixtures.length;
  }

  return stats;
}

/**
 * Load a random fixture for testing
 */
export async function loadRandomFixture(type: 'emails' | 'sites'): Promise<EmailFixture | SiteFixture> {
  const allFixtures = await loadAllFixtures(type);

  if (allFixtures.length === 0) {
    throw new Error(`No fixtures found for type: ${type}`);
  }

  const randomIndex = Math.floor(Math.random() * allFixtures.length);
  return allFixtures[randomIndex];
}

/**
 * Load fixtures matching specific criteria
 */
export async function loadFixturesByCriteria(criteria: {
  type?: 'emails' | 'sites';
  category?: string;
  pattern?: RegExp;
  limit?: number;
}): Promise<Array<EmailFixture | SiteFixture>> {
  const { type = 'emails', category, pattern, limit } = criteria;

  let fixtures = category
    ? await loadAllFixtures(type, category)
    : await loadAllFixtures(type);

  if (pattern) {
    fixtures = fixtures.filter((fixture) => {
      if ('html' in fixture) {
        return pattern.test(fixture.name) || pattern.test(fixture.html);
      } else {
        return pattern.test(fixture.id) || pattern.test(fixture.body);
      }
    });
  }

  if (limit && fixtures.length > limit) {
    fixtures = fixtures.slice(0, limit);
  }

  return fixtures;
}

/**
 * Export utility for batch operations
 */
export const FixtureLoader = {
  loadEmailFixture,
  loadSiteFixture,
  loadAllFixtures,
  loadEmailsByType,
  loadSitesByCategory,
  validateAllFixtures,
  findFixtures,
  getFixtureStats,
  loadRandomFixture,
  loadFixturesByCriteria,
};

export default FixtureLoader;
