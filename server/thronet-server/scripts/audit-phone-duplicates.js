'use strict';

const { MongoClient } = require('mongodb');

if (!process.argv.includes('--read-only')) {
  console.error('Refusing to run: pass --read-only and use a read-only MongoDB credential.');
  process.exit(2);
}

const uri = process.env.MONGODB_READONLY_URI;
const databaseName = process.env.MONGODB_DATABASE;
if (!uri || !databaseName) {
  console.error('Set MONGODB_READONLY_URI and MONGODB_DATABASE; no connection string is printed.');
  process.exit(2);
}

async function main() {
  const client = new MongoClient(uri, { readPreference: 'secondaryPreferred' });
  try {
    await client.connect();
    const users = await client.db(databaseName).collection('users')
      .find({}, {
        projection: {
          phoneNumber: 1,
          status: 1,
          accountStatus: 1,
          emailVerified: 1,
          phoneVerified: 1,
          createdAt: 1,
        },
      })
      .toArray();

    let nonEmptyPhoneCount = 0;
    let emptyPhoneCount = 0;
    let nullPhoneCount = 0;
    let missingPhoneCount = 0;
    const formats = new Map();
    const groups = new Map();

    for (const user of users) {
      if (!Object.prototype.hasOwnProperty.call(user, 'phoneNumber')) {
        missingPhoneCount += 1;
        continue;
      }
      if (user.phoneNumber === null) {
        nullPhoneCount += 1;
        continue;
      }
      if (typeof user.phoneNumber !== 'string') continue;
      if (user.phoneNumber.length === 0) {
        emptyPhoneCount += 1;
        continue;
      }

      nonEmptyPhoneCount += 1;
      const digits = user.phoneNumber.replace(/\D/g, '');
      const formatKey = `${user.phoneNumber.startsWith('+') ? 'leadingPlus' : 'noLeadingPlus'}:${digits.length}`;
      formats.set(formatKey, (formats.get(formatKey) || 0) + 1);
      if (digits.length < 10) continue;

      const suffix = digits.slice(-10);
      const group = groups.get(suffix) || {
        phoneLast4: suffix.slice(-4),
        size: 0,
        statuses: {},
        emailVerifiedCount: 0,
        phoneVerifiedCount: 0,
        verifiedCount: 0,
        createdAtMin: null,
        createdAtMax: null,
        allSameDigit: /^(\d)\1{9}$/.test(suffix),
      };
      group.size += 1;
      const status = String(user.accountStatus || user.status || 'unknown');
      group.statuses[status] = (group.statuses[status] || 0) + 1;
      if (user.emailVerified === true) group.emailVerifiedCount += 1;
      if (user.phoneVerified === true) group.phoneVerifiedCount += 1;
      if (user.emailVerified === true || user.phoneVerified === true) group.verifiedCount += 1;
      if (user.createdAt instanceof Date && !Number.isNaN(user.createdAt.getTime())) {
        const createdAt = user.createdAt.toISOString();
        if (!group.createdAtMin || createdAt < group.createdAtMin) group.createdAtMin = createdAt;
        if (!group.createdAtMax || createdAt > group.createdAtMax) group.createdAtMax = createdAt;
      }
      groups.set(suffix, group);
    }

    const duplicates = [...groups.entries()]
      .filter(([, group]) => group.size > 1)
      .map(([suffix, group]) => ({ ...group, _sort: suffix }))
      .sort((a, b) => a._sort.localeCompare(b._sort))
      .map(({ _sort, ...group }) => group);

    console.log(JSON.stringify({
      counts: {
        totalUsers: users.length,
        nonEmptyPhone: nonEmptyPhoneCount,
        emptyPhone: emptyPhoneCount,
        nullPhone: nullPhoneCount,
        missingPhone: missingPhoneCount,
      },
      formatSpread: [...formats.entries()]
        .map(([format, count]) => ({ format, count }))
        .sort((a, b) => a.format.localeCompare(b.format)),
      duplicateGroupCount: duplicates.length,
      duplicateGroups: duplicates,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch(() => {
  console.error('Read-only phone audit failed. No phone numbers, emails, ids, or connection details were printed.');
  process.exitCode = 1;
});
