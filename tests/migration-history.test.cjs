const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('checked-in Supabase migration versions match the deployed project history', () => {
  const directory = path.join(__dirname, '..', 'supabase', 'migrations');
  const files = fs.readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
  assert.deepEqual(files, [
    '20261121120444_tighten_user_data_privileges_and_policies.sql',
    '20261121141919_automatic_user_data_backups.sql',
    '20261121142015_harden_backup_access_with_rls.sql',
    '20261121142019_remove_backup_restore_delete_privilege.sql',
    '20261121155224_harden_username_registration_rate_limit.sql',
    '20261122075141_username_recovery_codes.sql',
    '20261122080138_auth_user_lookup_for_username_recovery.sql',
  ]);
});
