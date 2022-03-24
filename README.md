# Google Drive scanning with App Script

This repository contains singe file app script.

If you want to know all information about files: public or private access, who can edit and view then it is right project.

## How to run

1. Create Google App Script in your Google Drive.
2. Insert code from `main.gs`.
3. Create a folder in the your Google Drive where to store information and copy ID. Get link to folder: `https://drive.google.com/drive/folders/<folder_id>?...`
4. Create trigger in the App script project:
* Choose which function to run: `main`
* Choose which deployment should run: Head
* Select event source: Time-driven
* Select type of time based trigger: Minutes timer
* Select minute interval: Every 5 minutes or you can choose other time

After creating trigger and first execution in your Google Drive will be four files:
* Google sheets:
    * `users`
    * `files`
    * `user_file_perm`
* JSON:
    * `dump_info.json`

`dump_info.json` is auxiliary file.

All information will be collected when execution time is close to zero. A few hours is enough normally.

[There is execution quote](https://developers.google.com/apps-script/guides/services/quotas). You must run script a small amount of time. See: `SAVE_TOKEN_EVERY` and `TOTAL_RECORDS_PER_RUN` constants. API errors can be sometimes.
