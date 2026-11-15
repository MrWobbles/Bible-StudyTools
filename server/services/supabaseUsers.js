const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ENABLED,
  USER_PROFILES_TABLE,
  BOOTSTRAP_ADMIN_EMAIL,
  BOOTSTRAP_ADMIN_PASSWORD,
  BOOTSTRAP_ADMIN_USERNAME_RAW
} = require('../config/env');
const {
  supabaseServiceClient,
  buildSupabaseAdminHeaders,
  getMissingSupabaseTableMessage
} = require('./supabaseClient');
const { normalizeUsername, isValidUsername } = require('./supabaseAuth');

async function createSupabaseAuthUser({ email, password, appMetadata = {}, userMetadata = {}, emailConfirm = true }) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: buildSupabaseAdminHeaders(),
    body: JSON.stringify({
      email,
      password,
      email_confirm: emailConfirm,
      app_metadata: appMetadata,
      user_metadata: userMetadata
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.msg || payload?.error_description || payload?.error || 'Failed to create account.');
  }

  return payload;
}

async function updateSupabaseAuthUser(userId, payload) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(String(userId || '').trim())}`, {
    method: 'PUT',
    headers: buildSupabaseAdminHeaders(),
    body: JSON.stringify(payload)
  });

  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responsePayload?.msg || responsePayload?.error_description || responsePayload?.error || 'Failed to update account.');
  }

  return responsePayload;
}

async function deleteSupabaseAuthUser(userId, shouldSoftDelete = false) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    throw new Error('A valid user id is required.');
  }

  const suffix = shouldSoftDelete ? '?should_soft_delete=true' : '';
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(normalizedUserId)}${suffix}`, {
    method: 'DELETE',
    headers: buildSupabaseAdminHeaders()
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.msg || payload?.error_description || payload?.error || 'Failed to delete account.');
  }
}

async function findUserProfileByIdentifier(identifier) {
  const normalized = String(identifier || '').trim();
  if (!normalized) {
    return null;
  }

  const normalizedEmail = normalized.toLowerCase();
  const normalizedUsername = normalizeUsername(normalized);

  const { data, error } = await supabaseServiceClient
    .from(USER_PROFILES_TABLE)
    .select('user_id, username, email')
    .or(`email.eq.${normalizedEmail},username.eq.${normalizedUsername}`)
    .limit(1)
    .maybeSingle();

  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, USER_PROFILES_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to load account profile: ${error.message}`);
  }

  return data || null;
}

async function listAllUserProfiles() {
  const { data, error } = await supabaseServiceClient
    .from(USER_PROFILES_TABLE)
    .select('user_id, username, email, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, USER_PROFILES_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to load user accounts: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

async function deleteUserProfileRecord(userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return;
  }

  const { error } = await supabaseServiceClient
    .from(USER_PROFILES_TABLE)
    .delete()
    .eq('user_id', normalizedUserId);

  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, USER_PROFILES_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to remove user profile: ${error.message}`);
  }
}

async function upsertUserProfileRecord(userId, username, email) {
  const { error } = await supabaseServiceClient
    .from(USER_PROFILES_TABLE)
    .upsert({
      user_id: userId,
      username,
      email,
      created_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });

  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, USER_PROFILES_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to save user profile: ${error.message}`);
  }
}

async function findExistingUserProfile(username, email) {
  const { data, error } = await supabaseServiceClient
    .from(USER_PROFILES_TABLE)
    .select('user_id, username, email')
    .or(`username.eq.${username},email.eq.${email}`)
    .limit(1)
    .maybeSingle();

  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, USER_PROFILES_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to validate uniqueness: ${error.message}`);
  }

  return data || null;
}

async function ensureBootstrapAdminAccount() {
  if (!SUPABASE_SERVICE_ENABLED) {
    return;
  }

  if (!BOOTSTRAP_ADMIN_EMAIL && !BOOTSTRAP_ADMIN_PASSWORD && !BOOTSTRAP_ADMIN_USERNAME_RAW) {
    return;
  }

  if (!BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) {
    console.warn('[Supabase] Admin bootstrap skipped: set both BST_BOOTSTRAP_ADMIN_EMAIL and BST_BOOTSTRAP_ADMIN_PASSWORD.');
    return;
  }

  const derivedUsername = BOOTSTRAP_ADMIN_USERNAME_RAW || BOOTSTRAP_ADMIN_EMAIL.split('@')[0] || 'admin';
  const username = normalizeUsername(derivedUsername);
  if (!isValidUsername(username)) {
    console.warn('[Supabase] Admin bootstrap skipped: BST_BOOTSTRAP_ADMIN_USERNAME must be 3-30 chars using letters, numbers, dot, underscore, or dash.');
    return;
  }

  try {
    const existingProfile = await findExistingUserProfile(username, BOOTSTRAP_ADMIN_EMAIL);
    if (existingProfile?.user_id) {
      await updateSupabaseAuthUser(existingProfile.user_id, {
        app_metadata: { role: 'admin' },
        user_metadata: { username }
      });
      await upsertUserProfileRecord(existingProfile.user_id, username, BOOTSTRAP_ADMIN_EMAIL);
      console.log(`[Supabase] Bootstrap admin ensured for ${BOOTSTRAP_ADMIN_EMAIL}.`);
      return;
    }

    const createdUser = await createSupabaseAuthUser({
      email: BOOTSTRAP_ADMIN_EMAIL,
      password: BOOTSTRAP_ADMIN_PASSWORD,
      appMetadata: { role: 'admin' },
      userMetadata: { username },
      emailConfirm: true
    });

    const userId = String(createdUser?.id || '').trim();
    if (!userId) {
      throw new Error('Supabase returned an invalid bootstrap admin user record.');
    }

    await upsertUserProfileRecord(userId, username, BOOTSTRAP_ADMIN_EMAIL);
    console.log(`[Supabase] Bootstrap admin account created for ${BOOTSTRAP_ADMIN_EMAIL}.`);
  } catch (err) {
    console.error('[Supabase] Failed to bootstrap admin account:', err.message);
  }
}

module.exports = {
  createSupabaseAuthUser,
  updateSupabaseAuthUser,
  deleteSupabaseAuthUser,
  findUserProfileByIdentifier,
  listAllUserProfiles,
  deleteUserProfileRecord,
  upsertUserProfileRecord,
  findExistingUserProfile,
  ensureBootstrapAdminAccount
};
