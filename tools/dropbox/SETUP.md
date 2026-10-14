# Setting up the haftarah drop box

The drop box is a small Google Apps Script web app that lives in your Google account. Claude sends it the week's files and it saves them into the Haftarah folders exactly as built. You set it up once.

1. In a browser signed in as **daniel@centralreform.org**, open <https://script.google.com>.
2. Click **New project**. Rename it (top left) to `Haftarah drop box`.
3. Delete everything in the editor, then paste in the whole of `tools/dropbox/Code.gs`. Click the save icon.
4. Make a password for the drop box: a long random string, 40 characters or more, letters and digits only. Any password generator works (for example the one in your password manager, or <https://www.random.org/strings/>).
5. Click the gear icon (**Project Settings**) on the left. Scroll to **Script Properties**, click **Add script property**, and add:
   - Property `TOKEN`, value: the password from step 4.
   - Optional: `PUBLIC_FOLDER_ID` and `WORKING_FOLDER_ID`, only if the folders ever move. Without them it uses the current Haftarah and Haftarah working folders.

   Click **Save script properties**.
6. Click **Deploy** (top right) > **New deployment**. Click the gear next to "Select type" and choose **Web app**. Set:
   - Description: `drop box`
   - Execute as: **Me (daniel@centralreform.org)**
   - Who has access: **Anyone**

   Click **Deploy**.
7. Google asks you to authorize. Click **Authorize access**, pick your account, and allow access to Google Drive. If it says "Google hasn't verified this app", click **Advanced** > **Go to Haftarah drop box (unsafe)**; it is your own script.
8. Copy the **Web app URL** (it ends in `/exec`).
9. Give Claude the URL and the password. Claude saves them as `~/.haftarah-dropbox.json` in the session, or you can set `HAFTARAH_DROPBOX_URL` and `HAFTARAH_DROPBOX_TOKEN`.

To check it works, open `<the URL>?token=<the password>` in a browser. If the password has symbols (`&`, `#`, `%`, quotes), the browser link breaks; let Claude run the check instead. You should see `{"ok":true,"publicFolder":"Haftarah","workingFolder":"Haftarah working"}`.

**Why "Anyone" is safe:** the address does nothing without the password, so a stranger who finds it gets only `{"ok":false,"error":"unauthorized"}`.

**To shut it off:** Deploy > Manage deployments > archive the deployment, or change `TOKEN` in Script Properties (the old password stops working at once).

**If you change the code later:** Deploy > **Manage deployments** > pencil icon > Version: **New version** > Deploy. This keeps the same URL. A "New deployment" makes a new URL, and Claude would need it again.
