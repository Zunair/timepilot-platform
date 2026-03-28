/**
 * User profile and settings routes
 *
 * Endpoints for user to manage their own settings (timezone, profile, etc)
 */

import { Router, Request, Response } from 'express';
import { tenantContextMiddleware } from '../middleware/tenantContext.js';
import { userRepository } from '../repositories/UserRepository.js';
import type { UUID } from '../types/index.js';

export const userRouter = Router({ mergeParams: true });

/**
 * GET /api/users/me
 * Get current user's profile
 */
userRouter.get('/me', tenantContextMiddleware, async (req: Request, res: Response) => {
  const user = await userRepository.findById(req.tenant!.userId);
  if (!user) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
    return;
  }
  res.json(user);
});

/**
 * PATCH /api/users/me
 * Update current user's profile
 */
userRouter.patch('/me', tenantContextMiddleware, async (req: Request, res: Response) => {
  const { firstName, lastName, timezone, profileImageUrl } = req.body as {
    firstName?: string;
    lastName?: string;
    timezone?: string;
    profileImageUrl?: string;
  };

  const updates: Record<string, unknown> = {};
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (timezone !== undefined) {
    // Validate timezone is a valid IANA timezone
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      updates.timezone = timezone;
    } catch (e) {
      res
        .status(400)
        .json({ error: 'BAD_REQUEST', message: `Invalid timezone: ${timezone}` });
      return;
    }
  }
  if (profileImageUrl !== undefined) updates.profileImageUrl = profileImageUrl;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'No valid fields to update' });
    return;
  }

  const updated = await userRepository.update(req.tenant!.userId, updates as never);
  res.json(updated);
});

/**
 * GET /api/users/:userId
 * Get user profile (public endpoint - only safe fields)
 */
userRouter.get('/:userId', async (req: Request, res: Response) => {
  const user = await userRepository.findById(req.params.userId as UUID);
  if (!user) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
    return;
  }
  // Return only safe public fields
  res.json({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
  });
});
