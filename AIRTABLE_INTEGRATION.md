# Airtable Integration

The tracker can now mirror operational data into Airtable without making Airtable the source of truth.

## Environment

Add these variables to the backend environment:

```env
AIRTABLE_ACCESS_TOKEN=patxxxxxxxxxxxxxxxx
AIRTABLE_BASE_ID=appxxxxxxxxxxxxxx
AIRTABLE_PROJECTS_TABLE=Projects
AIRTABLE_STAGES_TABLE=Stages
AIRTABLE_COMMENTS_TABLE=Comments
AIRTABLE_DUE_DATE_REQUESTS_TABLE=Due Date Requests
AIRTABLE_WORKFLOW_SETTINGS_TABLE=Workflow Settings
AIRTABLE_REQUEST_TIMEOUT_SECONDS=20
```

If `AIRTABLE_ACCESS_TOKEN` or `AIRTABLE_BASE_ID` is missing, Airtable sync stays disabled and the tracker continues to work normally.

## What Syncs

These tracker actions now push updates to Airtable:

- Project creation
- Project metadata edits
- BOQ or attachment uploads
- Stage completion
- Direct due-date changes
- Due-date change requests and reviews
- Comment creation
- Workflow settings updates
- Project deletion

There is also an admin-only backfill endpoint:

```text
POST /api/v1/integrations/airtable/resync
```

Use it after the tables are created in Airtable so existing active projects are copied over.

## Airtable Tables

Create these tables in Airtable with the exact field names below.

### Projects

- `Tracker Project Id`
- `Project Code`
- `Project Name`
- `Client`
- `Priority`
- `Assigned Person`
- `Created By Name`
- `Created By Department`
- `Estimated TAT Days`
- `Total Order Value`
- `Special Request`
- `Current Stage Name`
- `Current Stage Phase`
- `Current Stage Department`
- `Current Stage Status`
- `Current Stage Due Date`
- `Current Stage Activated At`
- `Completed Stages`
- `Total Stages`
- `Pending Stages`
- `Overdue Stages`
- `Document Count`
- `Has BOQ`
- `Project URL`
- `Is Archived`
- `Created At`
- `Last Synced At`

### Stages

- `Tracker Stage Id`
- `Tracker Project Id`
- `Project Code`
- `Project Name`
- `Stage Key`
- `Stage Name`
- `Phase`
- `Responsible Department`
- `Status`
- `Sort Order`
- `Activated At`
- `Due Date`
- `Completed At`
- `Completed By Name`
- `Comment Count`
- `Due Date Request Count`
- `Is Current Stage`
- `Project URL`
- `Last Synced At`

### Comments

- `Tracker Comment Id`
- `Tracker Stage Id`
- `Tracker Project Id`
- `Project Code`
- `Project Name`
- `Stage Name`
- `Author Name`
- `Author Department`
- `Comment Text`
- `Created At`
- `Project URL`
- `Last Synced At`

### Due Date Requests

- `Tracker Due Date Request Id`
- `Tracker Stage Id`
- `Tracker Project Id`
- `Project Code`
- `Project Name`
- `Stage Name`
- `Current Due Date`
- `Requested Due Date`
- `Reason`
- `Requested By`
- `Requested By Department`
- `Status`
- `Reviewed By`
- `Review Note`
- `Reviewed At`
- `Created At`
- `Updated At`
- `Project URL`
- `Last Synced At`

### Workflow Settings

- `Stage Key`
- `Phase`
- `Stage Name`
- `Responsible Department`
- `Sort Order`
- `Default Due Days`
- `Updated At`
- `Last Synced At`

## Notes

- Airtable receives mirrored metadata only. BOQ files stay in Supabase storage.
- The Airtable sync uses tracker UUIDs and stage keys as stable external IDs.
- Workflow settings sync also removes stale Airtable rows whose `Stage Key` no longer exists in the tracker database.
