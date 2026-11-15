const crypto = require('crypto');
const {
  SIGNUP_REQUESTS_TABLE,
  SIGNUP_INVITES_TABLE,
  SIGNUP_NOTIFICATION_EMAIL,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM
} = require('../config/env');
const {
  supabaseServiceClient,
  getMissingSupabaseTableMessage
} = require('./supabaseClient');
const { normalizeUsername } = require('./supabaseAuth');

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (err) {
  nodemailer = null;
}

async function findInviteRecord(inviteCode) {
  if (!supabaseServiceClient) {
    return null;
  }

  const normalizedCode = String(inviteCode || '').trim();
  if (!normalizedCode) {
    return null;
  }

  const { data, error } = await supabaseServiceClient
    .from(SIGNUP_INVITES_TABLE)
    .select('*')
    .eq('invite_code', normalizedCode)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load invite code: ${error.message}`);
  }

  return data || null;
}

async function findSignupRequestById(requestId) {
  if (!supabaseServiceClient) {
    return null;
  }

  const normalizedId = Number.parseInt(String(requestId || ''), 10);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    return null;
  }

  const { data, error } = await supabaseServiceClient
    .from(SIGNUP_REQUESTS_TABLE)
    .select('*')
    .eq('id', normalizedId)
    .limit(1)
    .maybeSingle();

  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, SIGNUP_REQUESTS_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to load signup request: ${error.message}`);
  }

  return data || null;
}

async function listSignupRequests(statusFilter) {
  if (!supabaseServiceClient) {
    return [];
  }

  let query = supabaseServiceClient
    .from(SIGNUP_REQUESTS_TABLE)
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(200);

  const normalizedStatus = String(statusFilter || '').trim().toLowerCase();
  if (normalizedStatus) {
    query = query.eq('status', normalizedStatus);
  }

  const { data, error } = await query;
  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, SIGNUP_REQUESTS_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to load signup requests: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

function generateInviteCode() {
  return crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase();
}

async function createInviteRecord(payload) {
  if (!supabaseServiceClient) {
    throw new Error('Supabase service role is not configured for invite creation.');
  }

  const suppliedInviteCode = String(payload.inviteCode || '').trim().toUpperCase();
  const inviteEmail = String(payload.email || '').trim().toLowerCase() || null;
  const expiresAt = payload.expiresAt || null;
  const createdByUserId = String(payload.createdByUserId || '').trim() || null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = suppliedInviteCode || generateInviteCode();
    const { data, error } = await supabaseServiceClient
      .from(SIGNUP_INVITES_TABLE)
      .insert({
        invite_code: inviteCode,
        email: inviteEmail,
        expires_at: expiresAt,
        created_by_user_id: createdByUserId
      })
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!error) {
      return data || null;
    }

    const missingTableMessage = getMissingSupabaseTableMessage(error, SIGNUP_INVITES_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    const duplicateInvite = String(error.message || '').toLowerCase().includes('duplicate')
      || String(error.message || '').toLowerCase().includes('unique');
    if (duplicateInvite && !suppliedInviteCode) {
      continue;
    }

    throw new Error(`Failed to create invite code: ${error.message}`);
  }

  throw new Error('Failed to generate a unique invite code. Try again.');
}

async function updateSignupRequestApproval(requestId, payload) {
  if (!supabaseServiceClient) {
    throw new Error('Supabase service role is not configured for signup approvals.');
  }

  const normalizedId = Number.parseInt(String(requestId || ''), 10);
  const { data, error } = await supabaseServiceClient
    .from(SIGNUP_REQUESTS_TABLE)
    .update({
      status: payload.status,
      invite_code: payload.inviteCode || null,
      approved_at: payload.approvedAt || null,
      approved_by_user_id: payload.approvedByUserId || null
    })
    .eq('id', normalizedId)
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, SIGNUP_REQUESTS_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to update signup request: ${error.message}`);
  }

  return data || null;
}

async function markInviteUsed(inviteCode, userId) {
  if (!supabaseServiceClient) {
    return;
  }

  const { error } = await supabaseServiceClient
    .from(SIGNUP_INVITES_TABLE)
    .update({
      used_at: new Date().toISOString(),
      used_by_user_id: userId
    })
    .eq('invite_code', String(inviteCode || '').trim());

  if (error) {
    throw new Error(`Failed to mark invite as used: ${error.message}`);
  }
}

async function saveSignupRequestToDatabase(payload) {
  if (!supabaseServiceClient) {
    throw new Error('Supabase service role is not configured for signup requests.');
  }

  const insertPayload = {
    requested_at: new Date().toISOString(),
    status: 'pending',
    username: normalizeUsername(payload.username),
    email: String(payload.email || '').trim().toLowerCase(),
    display_name: String(payload.displayName || '').trim() || null,
    message: String(payload.message || '').trim() || null,
    source_ip: String(payload.sourceIp || '').trim() || null
  };

  const { data, error } = await supabaseServiceClient
    .from(SIGNUP_REQUESTS_TABLE)
    .insert(insertPayload)
    .select('id')
    .limit(1)
    .maybeSingle();

  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, SIGNUP_REQUESTS_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to save signup request: ${error.message}`);
  }

  return data || null;
}

async function sendSignupRequestNotification(payload) {
  if (!nodemailer) {
    return {
      sent: false,
      reason: 'Nodemailer is not installed.'
    };
  }

  if (!SMTP_HOST || !Number.isInteger(SMTP_PORT) || !SMTP_USER || !SMTP_PASS) {
    return {
      sent: false,
      reason: 'SMTP is not configured.'
    };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  const createdAt = new Date().toISOString();
  const subject = `Signup request: ${payload.username}`;
  const lines = [
    'A new signup request was submitted.',
    '',
    `Username: ${payload.username}`,
    `Email: ${payload.email}`,
    `Name: ${payload.displayName || '(not provided)'}`,
    `Submitted at: ${createdAt}`,
    `Source IP: ${payload.sourceIp || '(unknown)'}`,
    '',
    'Message:',
    payload.message || '(none)'
  ];

  await transporter.sendMail({
    from: SMTP_FROM,
    to: SIGNUP_NOTIFICATION_EMAIL,
    subject,
    text: lines.join('\n')
  });

  return { sent: true };
}

module.exports = {
  findInviteRecord,
  findSignupRequestById,
  listSignupRequests,
  createInviteRecord,
  updateSignupRequestApproval,
  markInviteUsed,
  saveSignupRequestToDatabase,
  sendSignupRequestNotification
};
