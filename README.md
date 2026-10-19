# Teacher Helper 📘

A simple, private web app for **hourly English teachers** (or any private tutor) to manage students, schedule lessons, and see exactly how many hours they taught and how much money they earned and are still owed.

No sign-up, no server, no database — it runs entirely in the browser and works on phone and desktop.

## Features

- **Students** — name, private hourly rate, level, phone, parent phone, colour, notes, active/inactive.
- **Groups** — put several students in a group (e.g. "Grade 6 — Group A") with an optional per-student group rate.
- **Private & group lessons** — one lesson can have one or many students. Each student in a lesson has their own rate, **attendance** (present/absent) and **payment** (paid/unpaid). Absent students are not charged.
- **Weekly schedule** — 7-day calendar, repeat weekly (up to 24 weeks), overlap warning.
- **Exams & quizzes tracker** — enter scores for a whole group at once or for individual students; see class average, highest and lowest.
- **Dashboards**
  - **Main dashboard** — earnings, hours, collected, outstanding, next 7 days, average grade, 12-month chart, recent grades, groups summary.
  - **All-students dashboard** — attendance, average grade, last grade and balance for every student, grade chart and a "needs attention" list.
  - **Student dashboard** — grade-progress chart vs. class average, every exam & quiz, every lesson with attendance and payment.
  - **Group dashboard** — class average per exam/quiz chart, member table (attendance, grades, balance), upcoming lessons.
- **Billing** — outstanding per student with one-click "Record payment", plus a ledger of every student in every lesson with filters.
- **Data** — JSON backup/restore, CSV export of lessons & payments and of grades (opens in Excel), sample data. Older backups are upgraded automatically.
- Light & dark mode, mobile-friendly, installable on your phone's home screen.

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
icon.svg, icon-*.png, apple-touch-icon.png – app icon
manifest.webmanifest – install on phone home screen
```

Charts use [Chart.js](https://www.chartjs.org/) from cdnjs.

---

## بالعربي

**Teacher Helper** برنامج ويب لمدرس الإنجليزي اللي بيشتغل بالساعة:
- تضيف الطلاب وسعر الساعة لكل طالب، وتعمل **جروبات** وتحط فيها الطلاب.
- الحصة ممكن يكون فيها **طالب واحد أو أكتر**، وكل طالب ليه سعره و**حضوره** و**دفعه** لوحده، والغايب ما بيتحسبش عليه.
- **متابعة الطلاب:** تسجل درجات الامتحانات والكويزات للجروب كله مرة واحدة أو لطالب لوحده.
- **داشبورد عام** و**داشبورد لكل الطلاب** و**داشبورد لكل طالب** و**داشبورد لكل جروب** فيها الحضور والدرجات والفلوس.
- صفحة Billing تشوف منها مين عليه فلوس وتسجل الدفع بضغطة.
- البيانات بتتحفظ على جهازك بس، وتقدر تعمل Backup وتصدّر Excel.

**النشر على GitHub:** ارفع الملفات على repo جديد ← Settings ← Pages ← اختار branch `main` وفولدر `/ (root)` ← Save، وبعد دقيقة الموقع هيشتغل على `username.github.io/teacher-helper`.

## License

MIT — see [LICENSE](LICENSE).
