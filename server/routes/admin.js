const express = require('express');
const {
  SUPABASE_SERVICE_ENABLED,
  SIGNUP_REQUESTS_TABLE
} = require('../config/env');
const { requireAdminAccess } = require('../middleware/auth');
const { supabaseServiceClient } = require('../services/supabaseClient');
const {
  listSignupRequests,
  findSignupRequestById,
  createInviteRecord,
  updateSignupRequestApproval
} = require('../services/supabaseInvitesAndRequests');
const {
  listAllUserProfiles,
  findUserProfileByIdentifier,
  updateSupabaseAuthUser,
  deleteSupabaseAuthUser,
  deleteUserProfileRecord
} = require('../services/supabaseUsers');

const router = express.Router();

router.get('/api/admin/signup-requests', requireAdminAccess, async (req, res) => {
  if (!SUPABASE_SERVICE_ENABLED || !supabaseServiceClient) {
    return res.status(503).json({ error: 'Supabase admin request management is not configured on this server.' });
  }

  try {
    const status = String(req.query?.status || '').trim();
    const requests = await listSignupRequests(status);
    return res.json({ success: true, requests });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load signup requests.' });
  }
});

router.get('/api/admin/accounts', requireAdminAccess, async (req, res) => {
  if (!SUPABASE_SERVICE_ENABLED || !supabaseServiceClient) {
    return res.status(503).json({ error: 'Supabase admin account management is not configured on this server.' });
  }

  try {
    const accounts = await listAllUserProfiles();
    return res.json({ success: true, accounts });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load user accounts.' });
  }
});

router.post('/api/admin/signup-requests/:requestId/approve', requireAdminAccess, async (req, res) => {
  if (!SUPABASE_SERVICE_ENABLED || !supabaseServiceClient) {
    return res.status(503).json({ error: 'Supabase admin request management is not configured on this server.' });
  }

  const requestId = Number.parseInt(String(req.params.requestId || ''), 10);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'requestId must be a positive integer.' });
  }

  const inviteCode = String(req.body?.inviteCode || '').trim().toUpperCase();
  const expiresInDays = Number.parseInt(String(req.body?.expiresInDays || '7'), 10);
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 90) {
    return res.status(400).json({ error: 'expiresInDays must be an integer between 1 and 90.' });
  }

  try {
    const signupRequest = await findSignupRequestById(requestId);
    if (!signupRequest) {
      return res.status(404).json({ error: 'Signup request not found.' });
    }

    if (String(signupRequest.status || '').trim().toLowerCase() === 'approved') {
      return res.status(409).json({ error: 'Signup request has already been approved.' });
    }

    const approvedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    const createdInvite = await createInviteRecord({
      inviteCode,
      email: signupRequest.email,
      expiresAt,
      createdByUserId: req.authUser?.id || null
    });

    const updatedRequest = await updateSignupRequestApproval(requestId, {
      status: 'approved',
      inviteCode: String(createdInvite?.invite_code || '').trim() || inviteCode,
      approvedAt,
      approvedByUserId: req.authUser?.id || null
    });

    return res.json({
      success: true,
      inviteCode: String(createdInvite?.invite_code || '').trim() || inviteCode,
      invite: createdInvite,
      request: updatedRequest,
      message: 'Signup request approved.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to approve signup request.' });
  }
});

router.post('/api/admin/signup-requests/:requestId/reject', requireAdminAccess, async (req, res) => {
  if (!SUPABASE_SERVICE_ENABLED || !supabaseServiceClient) {
    return res.status(503).json({ error: 'Supabase admin request management is not configured on this server.' });
  }

  const requestId = Number.parseInt(String(req.params.requestId || ''), 10);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'requestId must be a positive integer.' });
  }

  const reason = String(req.body?.reason || '').trim();

  try {
    const signupRequest = await findSignupRequestById(requestId);
    if (!signupRequest) {
      return res.status(404).json({ error: 'Signup request not found.' });
    }

    const currentStatus = String(signupRequest.status || '').trim().toLowerCase();
    if (currentStatus === 'approved') {
      return res.status(409).json({ error: 'Approved requests cannot be rejected.' });
    }

    if (currentStatus === 'rejected') {
      return res.status(409).json({ error: 'Signup request has already been rejected.' });
    }

    const updatedRequest = await updateSignupRequestApproval(requestId, {
      status: 'rejected',
      inviteCode: null,
      approvedAt: new Date().toISOString(),
      approvedByUserId: req.authUser?.id || null
    });

    if (reason && supabaseServiceClient) {
      await supabaseServiceClient
        .from(SIGNUP_REQUESTS_TABLE)
        .update({ message: `${String(signupRequest.message || '').trim()}\n\n[Rejected by admin] ${reason}`.trim() })
        .eq('id', requestId);
    }

    return res.json({
      success: true,
      request: updatedRequest,
      message: 'Signup request rejected.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to reject signup request.' });
  }
});

router.post('/api/admin/accounts/reset-password', requireAdminAccess, async (req, res) => {
  if (!SUPABASE_SERVICE_ENABLED || !supabaseServiceClient) {
    return res.status(503).json({ error: 'Supabase admin account management is not configured on this server.' });
  }

  const identifier = String(req.body?.identifier || '').trim();
  const newPassword = String(req.body?.newPassword || '');

  if (!identifier || !newPassword) {
    return res.status(400).json({ error: 'identifier and newPassword are required.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'newPassword must be at least 8 characters.' });
  }

  try {
    const profile = await findUserProfileByIdentifier(identifier);
    if (!profile?.user_id) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    await updateSupabaseAuthUser(profile.user_id, {
      password: newPassword
    });

    return res.json({
      success: true,
      userId: profile.user_id,
      identifier: profile.email || profile.username,
      message: 'Password reset successfully.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to reset password.' });
  }
});

router.delete('/api/admin/accounts/:identifier', requireAdminAccess, async (req, res) => {
  if (!SUPABASE_SERVICE_ENABLED || !supabaseServiceClient) {
    return res.status(503).json({ error: 'Supabase admin account management is not configured on this server.' });
  }

  const identifier = String(req.params.identifier || '').trim();
  if (!identifier) {
    return res.status(400).json({ error: 'identifier is required.' });
  }

  try {
    const profile = await findUserProfileByIdentifier(identifier);
    if (!profile?.user_id) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    const targetUserId = String(profile.user_id || '').trim();
    if (req.authUser?.id && targetUserId === String(req.authUser.id).trim()) {
      return res.status(400).json({ error: 'You cannot remove the account currently in use.' });
    }

    await deleteSupabaseAuthUser(targetUserId, false);
    await deleteUserProfileRecord(targetUserId);

    return res.json({
      success: true,
      userId: targetUserId,
      identifier: profile.email || profile.username,
      message: 'Account removed successfully.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to remove account.' });
  }
});

module.exports = router;
