# Teacher Helper 📘

A simple, private web app for **hourly English teachers** (or any private tutor) to manage students, schedule lessons, and see exactly how many hours they taught and how much money they earned and are still owed.

No sign-up, no server, no database — it runs entirely in the browser and works on phone and desktop.

## Features

- **Students** — name, hourly rate, phone, colour, notes, active/inactive.
- **Automatic calculation** — every lesson = hours × the student's hourly rate. Changing a student's rate later does not change past lessons.
- **Weekly schedule** — 7-day calendar, add lessons from any day, repeat weekly (up to 24 weeks), overlap warning.
- **Lesson status** — Scheduled → Done / Cancelled, plus Paid / Unpaid.
- **Dashboard & analytics**
  - Earned, hours taught, average hourly rate, collected, outstanding, next 7 days' value
  - Earnings & hours chart for the last 12 months
  - Hours by student (doughnut chart)
  - Period filter: this month, last month, last 3 months, this year, all time
  - "Lessons to confirm" — past lessons you haven't marked done yet
- **Billing** — outstanding balance per student with one-click "Record payment", plus a filterable lesson ledger (student, status, paid, month).
- **Data** — export/import JSON backup, export lessons to CSV (opens in Excel), sample data to try the app.
- Light & dark mode, mobile-friendly, installable on your phone's home screen with its own icon.

## Run locally

Just open `index.html` in a browser. That's it.

## Publish on GitHub Pages (free)

1. Create a new repository on GitHub, e.g. `teacher-helper`.
2. Upload these files to the root of the repo (all files in this folder, including the icons and `manifest.webmanifest`).
   Or with git:
   ```bash
   git init
   git add .
   git commit -m "Teacher Helper v1"
   git branch -M main
   git remote add origin https://github.com/<your-username>/teacher-helper.git
   git push -u origin main
   ```
3. In the repo go to **Settings → Pages**, set **Source: Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. After a minute your app is live at `https://<your-username>.github.io/teacher-helper/`.

## Your data

All data is stored in your browser's `localStorage` on the device you use. It is never sent anywhere.
- Use **Settings → Export backup** regularly.
- To move to another phone/computer: export on the old one, then **Import backup** on the new one.
- Clearing browser data will delete it, so keep a backup.

## Project structure

```
index.html   – page shell
styles.css   – styles (light/dark, responsive)
app.js       – all app logic (no build step)
icon.svg, icon-192.png, icon-512.png, apple-touch-icon.png – app icon
manifest.webmanifest – lets you install it on your phone's home screen
```

Charts use [Chart.js](https://www.chartjs.org/) from cdnjs.

---

## بالعربي

**Teacher Helper** برنامج ويب لمدرس الإنجليزي اللي بيشتغل بالساعة:
- تضيف الطلاب وسعر الساعة لكل طالب، والبرنامج يحسب فلوس كل حصة تلقائيًا (عدد الساعات × السعر).
- جدول أسبوعي للحصص مع تكرار أسبوعي وتنبيه لو حصتين متداخلين.
- داشبورد فيها الساعات والفلوس المكسوبة والمحصّلة والمتأخرة على كل طالب، ورسوم بيانية لآخر 12 شهر.
- صفحة Billing تشوف منها مين عليه فلوس وتسجل الدفع بضغطة.
- البيانات بتتحفظ على جهازك بس، وتقدر تعمل Backup وتصدّر Excel.

**النشر على GitHub:** ارفع الملفات على repo جديد ← Settings ← Pages ← اختار branch `main` وفولدر `/ (root)` ← Save، وبعد دقيقة الموقع هيشتغل على `username.github.io/teacher-helper`.

## License

MIT — see [LICENSE](LICENSE).
