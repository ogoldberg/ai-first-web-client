/**
 * Beta Program Service
 *
 * Manages the private beta program including:
 * - Waitlist management
 * - Invite code generation and validation
 * - Beta user feedback collection
 * - Program statistics
 */

import { randomBytes } from 'crypto';
import type {
  BetaWaitlistEntry,
  BetaWaitlistStatus,
  BetaInvite,
  BetaFeedback,
  BetaFeedbackCategory,
  BetaFeedbackPriority,
  BetaProgramStats,
} from '../middleware/types.js';

// In-memory stores (will be replaced with database in production)
const waitlistStore = new Map<string, BetaWaitlistEntry>();
const inviteStore = new Map<string, BetaInvite>();
const feedbackStore = new Map<string, BetaFeedback>();

// Indexes for faster lookups
const waitlistByEmail = new Map<string, string>(); // email -> id
const inviteByCode = new Map<string, string>(); // code -> id

/**
 * Generate a unique ID
 */
function generateId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Generate a beta invite code
 * Format: BETA-XXXX-XXXX-XXXX (alphanumeric, easy to read)
 */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars (0, O, 1, I)
  const segments: string[] = [];

  for (let s = 0; s < 3; s++) {
    let segment = '';
    for (let i = 0; i < 4; i++) {
      segment += chars[Math.floor(Math.random() * chars.length)];
    }
    segments.push(segment);
  }

  return `BETA-${segments.join('-')}`;
}

// =============================================================================
// Waitlist Management
// =============================================================================

export interface JoinWaitlistInput {
  email: string;
  name: string;
  company?: string;
  useCase: string;
  expectedVolume?: string;
  referralSource?: string;
}

/**
 * Add someone to the beta waitlist
 */
export async function joinWaitlist(
  input: JoinWaitlistInput
): Promise<{ success: boolean; entry?: BetaWaitlistEntry; error?: string }> {
  const email = input.email.toLowerCase().trim();

  // Check if already on waitlist
  if (waitlistByEmail.has(email)) {
    const existingId = waitlistByEmail.get(email)!;
    const existing = waitlistStore.get(existingId);
    return {
      success: false,
      error: 'Email already on waitlist',
      entry: existing,
    };
  }

  const id = generateId();
  const now = new Date();

  const entry: BetaWaitlistEntry = {
    id,
    email,
    name: input.name.trim(),
    company: input.company?.trim() || null,
    useCase: input.useCase.trim(),
    expectedVolume: input.expectedVolume?.trim() || null,
    referralSource: input.referralSource?.trim() || null,
    status: 'pending',
    inviteCode: null,
    invitedAt: null,
    joinedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  waitlistStore.set(id, entry);
  waitlistByEmail.set(email, id);

  return { success: true, entry };
}

/**
 * Get waitlist entry by email
 */
export async function getWaitlistEntry(
  email: string
): Promise<BetaWaitlistEntry | null> {
  const id = waitlistByEmail.get(email.toLowerCase().trim());
  if (!id) return null;
  return waitlistStore.get(id) || null;
}

/**
 * Get waitlist entry by ID
 */
export async function getWaitlistEntryById(
  id: string
): Promise<BetaWaitlistEntry | null> {
  return waitlistStore.get(id) || null;
}

/**
 * List waitlist entries with optional filtering
 */
export async function listWaitlist(options?: {
  status?: BetaWaitlistStatus;
  limit?: number;
  offset?: number;
}): Promise<{ entries: BetaWaitlistEntry[]; total: number }> {
  let entries = Array.from(waitlistStore.values());

  if (options?.status) {
    entries = entries.filter((e) => e.status === options.status);
  }

  // Sort by creation date (newest first)
  entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = entries.length;
  const offset = options?.offset || 0;
  const limit = options?.limit || 50;

  entries = entries.slice(offset, offset + limit);

  return { entries, total };
}

/**
 * Update waitlist entry status
 */
export async function updateWaitlistStatus(
  id: string,
  status: BetaWaitlistStatus,
  inviteCode?: string
): Promise<{ success: boolean; error?: string }> {
  const entry = waitlistStore.get(id);
  if (!entry) {
    return { success: false, error: 'Waitlist entry not found' };
  }

  entry.status = status;
  entry.updatedAt = new Date();

  if (status === 'invited' && inviteCode) {
    entry.inviteCode = inviteCode;
    entry.invitedAt = new Date();
  }

  if (status === 'joined') {
    entry.joinedAt = new Date();
  }

  waitlistStore.set(id, entry);
  return { success: true };
}

// =============================================================================
// Invite Code Management
// =============================================================================

export interface CreateInviteInput {
  email?: string;
  maxUses?: number;
  expiresInDays?: number;
  createdBy: string;
}

/**
 * Create a beta invite code
 */
export async function createInvite(
  input: CreateInviteInput
): Promise<{ success: boolean; invite?: BetaInvite; error?: string }> {
  const code = generateInviteCode();
  const id = generateId();
  const now = new Date();

  const invite: BetaInvite = {
    id,
    code,
    email: input.email?.toLowerCase().trim() || null,
    maxUses: input.maxUses || 1,
    usedCount: 0,
    expiresAt: input.expiresInDays
      ? new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null,
    createdBy: input.createdBy,
    createdAt: now,
    revokedAt: null,
  };

  inviteStore.set(id, invite);
  inviteByCode.set(code, id);

  return { success: true, invite };
}

/**
 * Validate an invite code
 */
export async function validateInviteCode(
  code: string,
  email?: string
): Promise<{
  valid: boolean;
  invite?: BetaInvite;
  error?: string;
}> {
  const normalizedCode = code.toUpperCase().trim();
  const id = inviteByCode.get(normalizedCode);

  if (!id) {
    return { valid: false, error: 'Invalid invite code' };
  }

  const invite = inviteStore.get(id);
  if (!invite) {
    return { valid: false, error: 'Invite not found' };
  }

  // Check if revoked
  if (invite.revokedAt) {
    return { valid: false, error: 'Invite code has been revoked' };
  }

  // Check if expired
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return { valid: false, error: 'Invite code has expired' };
  }

  // Check if max uses reached
  if (invite.usedCount >= invite.maxUses) {
    return { valid: false, error: 'Invite code has reached maximum uses' };
  }

  // Check if email-specific
  if (invite.email && email && invite.email !== email.toLowerCase().trim()) {
    return {
      valid: false,
      error: 'This invite code is reserved for a different email',
    };
  }

  return { valid: true, invite };
}

/**
 * Use an invite code (increment usage count)
 */
export async function useInviteCode(
  code: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedCode = code.toUpperCase().trim();
  const id = inviteByCode.get(normalizedCode);

  if (!id) {
    return { success: false, error: 'Invalid invite code' };
  }

  const invite = inviteStore.get(id);
  if (!invite) {
    return { success: false, error: 'Invite not found' };
  }

  invite.usedCount++;
  inviteStore.set(id, invite);

  return { success: true };
}

/**
 * Revoke an invite code
 */
export async function revokeInvite(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const invite = inviteStore.get(id);
  if (!invite) {
    return { success: false, error: 'Invite not found' };
  }

  invite.revokedAt = new Date();
  inviteStore.set(id, invite);

  return { success: true };
}

/**
 * List invite codes
 */
export async function listInvites(options?: {
  includeRevoked?: boolean;
  includeExpired?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ invites: BetaInvite[]; total: number }> {
  let invites = Array.from(inviteStore.values());
  const now = new Date();

  if (!options?.includeRevoked) {
    invites = invites.filter((i) => !i.revokedAt);
  }

  if (!options?.includeExpired) {
    invites = invites.filter((i) => !i.expiresAt || i.expiresAt > now);
  }

  // Sort by creation date (newest first)
  invites.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = invites.length;
  const offset = options?.offset || 0;
  const limit = options?.limit || 50;

  invites = invites.slice(offset, offset + limit);

  return { invites, total };
}

// =============================================================================
// Feedback Collection
// =============================================================================

export interface SubmitFeedbackInput {
  tenantId: string;
  category: BetaFeedbackCategory;
  priority?: BetaFeedbackPriority;
  title: string;
  description: string;
  context?: {
    endpoint?: string;
    requestId?: string;
    errorCode?: string;
    browserInfo?: string;
  };
}

/**
 * Submit beta feedback
 */
export async function submitFeedback(
  input: SubmitFeedbackInput
): Promise<{ success: boolean; feedback?: BetaFeedback; error?: string }> {
  const id = generateId();
  const now = new Date();

  const feedback: BetaFeedback = {
    id,
    tenantId: input.tenantId,
    category: input.category,
    priority: input.priority || 'medium',
    title: input.title.trim(),
    description: input.description.trim(),
    context: input.context || null,
    status: 'new',
    adminNotes: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  feedbackStore.set(id, feedback);

  return { success: true, feedback };
}

/**
 * Get feedback by ID
 */
export async function getFeedback(id: string): Promise<BetaFeedback | null> {
  return feedbackStore.get(id) || null;
}

/**
 * List feedback with optional filtering
 */
export async function listFeedback(options?: {
  tenantId?: string;
  category?: BetaFeedbackCategory;
  status?: BetaFeedback['status'];
  priority?: BetaFeedbackPriority;
  limit?: number;
  offset?: number;
}): Promise<{ feedback: BetaFeedback[]; total: number }> {
  let feedback = Array.from(feedbackStore.values());

  if (options?.tenantId) {
    feedback = feedback.filter((f) => f.tenantId === options.tenantId);
  }

  if (options?.category) {
    feedback = feedback.filter((f) => f.category === options.category);
  }

  if (options?.status) {
    feedback = feedback.filter((f) => f.status === options.status);
  }

  if (options?.priority) {
    feedback = feedback.filter((f) => f.priority === options.priority);
  }

  // Sort by creation date (newest first), then by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  feedback.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const total = feedback.length;
  const offset = options?.offset || 0;
  const limit = options?.limit || 50;

  feedback = feedback.slice(offset, offset + limit);

  return { feedback, total };
}

/**
 * Update feedback status
 */
export async function updateFeedbackStatus(
  id: string,
  status?: BetaFeedback['status'],
  adminNotes?: string
): Promise<{ success: boolean; error?: string }> {
  const feedback = feedbackStore.get(id);
  if (!feedback) {
    return { success: false, error: 'Feedback not found' };
  }

  feedback.updatedAt = new Date();

  if (status !== undefined) {
    feedback.status = status;
    if (status === 'resolved' || status === 'wont_fix') {
      feedback.resolvedAt = new Date();
    }
  }

  if (adminNotes !== undefined) {
    feedback.adminNotes = adminNotes;
  }

  feedbackStore.set(id, feedback);

  return { success: true };
}

// =============================================================================
// Program Statistics
// =============================================================================

/**
 * Get beta program statistics
 */
export async function getBetaProgramStats(): Promise<BetaProgramStats> {
  const waitlistEntries = Array.from(waitlistStore.values());
  const invites = Array.from(inviteStore.values());
  const feedback = Array.from(feedbackStore.values());
  const now = new Date();

  const waitlistStats = {
    total: waitlistEntries.length,
    pending: waitlistEntries.filter((e) => e.status === 'pending').length,
    invited: waitlistEntries.filter((e) => e.status === 'invited').length,
    joined: waitlistEntries.filter((e) => e.status === 'joined').length,
    declined: waitlistEntries.filter((e) => e.status === 'declined').length,
  };

  const activeInvites = invites.filter(
    (i) =>
      !i.revokedAt &&
      (!i.expiresAt || i.expiresAt > now) &&
      i.usedCount < i.maxUses
  );

  const openIssues = feedback.filter(
    (f) =>
      f.status === 'new' ||
      f.status === 'acknowledged' ||
      f.status === 'in_progress'
  );

  return {
    waitlist: waitlistStats,
    activeUsers: waitlistStats.joined,
    totalFeedback: feedback.length,
    openIssues: openIssues.length,
    inviteCodesActive: activeInvites.length,
  };
}

// =============================================================================
// Admin Functions
// =============================================================================

/**
 * Invite a waitlist entry (create invite and update their status)
 */
export async function inviteWaitlistEntry(
  waitlistId: string,
  createdBy: string,
  options?: { expiresInDays?: number }
): Promise<{ success: boolean; invite?: BetaInvite; error?: string }> {
  const entry = await getWaitlistEntryById(waitlistId);
  if (!entry) {
    return { success: false, error: 'Waitlist entry not found' };
  }

  if (entry.status !== 'pending') {
    return { success: false, error: `Entry already has status: ${entry.status}` };
  }

  // Create invite
  const inviteResult = await createInvite({
    email: entry.email,
    maxUses: 1,
    expiresInDays: options?.expiresInDays || 14,
    createdBy,
  });

  if (!inviteResult.success || !inviteResult.invite) {
    return { success: false, error: inviteResult.error };
  }

  // Update waitlist status
  await updateWaitlistStatus(waitlistId, 'invited', inviteResult.invite.code);

  return { success: true, invite: inviteResult.invite };
}

/**
 * Batch invite multiple waitlist entries
 */
export async function batchInviteWaitlist(
  waitlistIds: string[],
  createdBy: string,
  options?: { expiresInDays?: number }
): Promise<{
  success: boolean;
  invited: number;
  failed: number;
  errors: string[];
}> {
  const results = await Promise.all(
    waitlistIds.map(id =>
      inviteWaitlistEntry(id, createdBy, options).then(res => ({ id, ...res }))
    )
  );

  const invited = results.filter(r => r.success).length;
  const failed = results.length - invited;
  const errors = results
    .filter(r => !r.success)
    .map(r => `${r.id}: ${r.error}`);

  return { success: failed === 0, invited, failed, errors };
}

// =============================================================================
// Store Management (for testing)
// =============================================================================

/**
 * Clear all beta program data (for testing)
 */
export function clearBetaProgramData(): void {
  waitlistStore.clear();
  waitlistByEmail.clear();
  inviteStore.clear();
  inviteByCode.clear();
  feedbackStore.clear();
}

/**
 * Get store sizes (for debugging)
 */
export function getStoreSizes(): {
  waitlist: number;
  invites: number;
  feedback: number;
} {
  return {
    waitlist: waitlistStore.size,
    invites: inviteStore.size,
    feedback: feedbackStore.size,
  };
}
