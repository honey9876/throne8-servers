# Phone duplicate audit and operator plan

No database was connected to, and no script, index command, or data change was run
for this change. Production facts below are the owner's supplied read-only results.

## Read-only audit script

Run only with a MongoDB credential restricted to read operations. The script
requires the explicit `--read-only` flag and reads connection settings from
environment variables without printing them:

```powershell
$env:MONGODB_READONLY_URI = '<read-only MongoDB URI>'
$env:MONGODB_DATABASE = '<database name>'
node scripts\audit-phone-duplicates.js --read-only
```

It prints counts, phone format/length counts, and duplicate groups by the last
10 digits. Per group it shows only the last four digits, group size, status
counts, verified counts, created-at range, and an all-same-digit flag. It never
prints phone numbers, email addresses, or user ids and contains no write calls.

## Current supplied production result

- Email: `email_1` is already unique and the normalized duplicate-group count is
  0. No new email index is needed. A case-insensitive collation index is optional
  and low priority because registration normalizes email to trimmed lowercase.
- Phone: `phoneNumber_1` is sparse and non-unique. There are 14 groups by the
  last 10 digits, about 49 accounts total (35 beyond the first in each group),
  66 users with a non-empty phone and 14 users with no phone field. A full unique
  phone index is not safe yet. Spaces and punctuation in legacy stored values
  would not match the application's exact-string legacy lookup variants; the
  read-only format audit must be reviewed before a full index.

The supplied format spread is 35 bare 10-digit values, 29 values with a leading
`+` and 12 digits, and two unprefixed values of 11 and 12 digits. The supplied
facts do not state whether any records have an empty string or `null`; the
read-only script reports those counts.

## Cleanup plan (owner-run; no changes made by this project)

1. Take and verify a database backup/snapshot.
2. Run the guarded read-only audit and prepare an owner-reviewed list of user ids
   for each of the 14 duplicate groups. The audit script intentionally does not
   emit ids; join its suffix/count results to a separately protected owner-side
   review.
3. For each group, retain the verified or oldest account. From the owner-reviewed
   id list, remove only the `phoneNumber` field from each extra account. Do not
   delete those user accounts or change their other data.
4. Make every remaining phone consistent with canonical E.164, including legacy
   values containing spaces, dashes, dots, or parentheses. Re-run the read-only
   audit and verify no duplicate last-10-digit groups remain.
5. Confirm all phone-creating paths store canonical E.164. The Mongoose
   `UserSchema` has `timestamps: true` in `src/auth/models/User.model.ts`, which
   sets `createdAt` for documents saved through that model. Before using the
   interim index below, verify that every user creation path goes through a
   timestamped Mongoose write and that any raw/import writes also set `createdAt`.

## Option 1 (interim): index new accounts only

After the new registration code is deployed, this partial unique index covers
only non-empty phone numbers on accounts created on or after the deployment
date. Replace `<DEPLOY DATE>` with the deployment timestamp as a MongoDB
`ISODate`, in UTC:

```javascript
db.users.createIndex({ phoneNumber: 1 }, { name: "phoneNumber_unique_new", unique: true,
  partialFilterExpression: { phoneNumber: { $type: "string", $gt: "" },
    createdAt: { $gte: ISODate("<DEPLOY DATE>") } } })
```

Prerequisite: verify `createdAt` is set for every user creation path before
running this command. `UserSchema` enables Mongoose timestamps, but this does not
cover writes that bypass Mongoose middleware or the model; check raw/import
paths explicitly.

Rollback:

```javascript
db.users.dropIndex("phoneNumber_unique_new")
```

Old duplicate accounts have `createdAt` values before the index cutoff and stay
outside this index. The registration application's duplicate pre-check still
checks all account states, including those old accounts, and blocks a new
registration against any of their phone-number variants.

## Option 2: full non-empty phone index (owner command only, after cleanup)

The 14 supplied duplicate groups block this command today. Run it only after
the owner-reviewed cleanup above and a fresh read-only audit confirms that all
non-empty phone values are unique and canonical:

```javascript
db.users.createIndex(
  { phoneNumber: 1 },
  {
    name: "phoneNumber_unique_nonempty",
    unique: true,
    partialFilterExpression: { phoneNumber: { $type: "string", $gt: "" } }
  }
)
```

Rollback:

```javascript
db.users.dropIndex("phoneNumber_unique_nonempty")
```

Neither option's index command has been submitted to MongoDB. No existing users
were modified or deleted as part of this work.
