# Google Sheets Integration — Setup Guide

This guide walks through creating the service account JSON key and connecting it to the app.

---

## Prerequisites

- Google account with access to Google Cloud Console
- A Google Sheet already created for KPV data (or create one now)

---

## Step 1 — Create a Google Cloud Project

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Click the project selector at the top → **New Project**
3. Name it (e.g., `kpv-kpi-tracking`) → **Create**
4. Wait for the project to be created, then select it from the project selector

---

## Step 2 — Enable Required APIs

1. In the left menu → **APIs & Services** → **Library**
2. Search `Google Sheets API` → click it → **Enable**
3. Go back to Library → search `Google Drive API` → **Enable**

Both must be enabled. Sheets API handles read/write; Drive API is required for file-level access.

---

## Step 3 — Create a Service Account

1. In left menu → **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **Service Account**
3. Fill in:
   - **Service account name**: `kpv-kpi-tracking` (or any name)
   - **Service account ID**: auto-filled (e.g., `kpv-kpi-tracking@your-project.iam.gserviceaccount.com`)
   - Description: optional
4. Click **Create and Continue**
5. **Grant this service account access** — set Role to **Editor** → **Continue**
6. Click **Done** (skip the optional "grant users access" step)

---

## Step 4 — Generate the JSON Key

1. In **APIs & Services** → **Credentials**, find the service account you just created under "Service Accounts"
2. Click the service account name to open it
3. Go to the **Keys** tab → **Add Key** → **Create new key**
4. Select **JSON** → **Create**
5. A `.json` file downloads automatically — this is your credential file

> **Security warning:** This file contains a private key. Anyone with it can access your Google Sheets. Never commit it to git, share it publicly, or upload it to any cloud service.

---

## Step 5 — Place the Key in the Project

1. Move the downloaded JSON file into this folder:

   ```
   KPV sale performance tracking\credentials\
   ```

2. Rename it to something clear, e.g.:

   ```
   kpv-kpi-tracking-d1eca8c7501a.json
   ```

3. Confirm `credentials/` is in `.gitignore` — open `.gitignore` and check for the line:

   ```
   credentials/
   ```

   If missing, add it. **Do not skip this check.**

---

## Step 6 — Share the Google Sheet with the Service Account

1. Open the Google Sheet you want to sync with
2. Click **Share** (top right)
3. Paste the service account email address — it looks like:
   ```
   kpv-kpi-tracking@your-project.iam.gserviceaccount.com
   ```
   (Find this in the JSON file under the `"client_email"` field)
4. Set permission to **Editor**
5. Uncheck "Notify people" → **Share**

The app writes to the sheet, so Editor access is required.

---

## Step 7 — Get the Google Sheet ID

1. Open your Google Sheet in the browser
2. Look at the URL:
   ```
   https://docs.google.com/spreadsheets/d/SHEET_ID_IS_HERE/edit#gid=0
   ```
3. Copy the long string between `/d/` and `/edit` — that is the Sheet ID

---

## Step 8 — Configure the App

1. Open the app → log in as **Admin**
2. Go to **Settings**
3. Fill in:
   - **Service Account JSON Path**: full path to the JSON file, e.g.:
     ```
     C:\Users\advice\KPV sale performance tracking\credentials\kpv-kpi-tracking-d1eca8c7501a.json
     ```
   - **Google Sheet ID**: paste the Sheet ID from Step 7
4. Click **Save Settings**

---

## Step 9 — Test the Connection

1. In Settings → click **Push to Cloud**
   - Should upload unsynced daily entries to the Sheet
   - If it fails, check the JSON path is correct and the service account has Editor access on the sheet

2. Click **Pull from Cloud**
   - Should read entries and CommissionConfig tab back into the local database

---

## Expected Sheet Structure (auto-created by app)

| Tab Name | Contents |
|----------|----------|
| `Sheet1` (default) | Daily entry data pushed from the app |
| `CommissionConfig` | B2C / B2B commission rates per month |

The app creates these tabs automatically on first push.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid_grant` | System clock out of sync | Sync Windows clock to internet time |
| `PERMISSION_DENIED` | Sheet not shared with service account | Re-share the sheet (Step 6) |
| `File not found` | Wrong path to JSON | Check path in Settings, use full absolute path |
| `API not enabled` | Sheets/Drive API disabled | Re-enable in Cloud Console (Step 2) |
| `The caller does not have permission` | Service account role too low | Set role to Editor in Cloud Console (Step 3) |

---

## JSON File Structure Reference

The downloaded JSON looks like this (do not modify it):

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...",
  "client_email": "kpv-kpi-tracking@your-project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

The `client_email` value is what you share the Google Sheet with.
