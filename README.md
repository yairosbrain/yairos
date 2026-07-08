# Y.A.I.R.O.S

> **Your Artificial Intelligence Realtime Operating System**
> העוזר האישי בהשראת J.A.R.V.I.S — גלקסיית סוכנים תלת־ממדית, שליטה בקול בעברית ובאנגלית, רץ 100% על שכבות חינמיות.

## מה זה

PWA שנפתח מכל מכשיר, מציג "מוח" תלת־ממדי שבו כל כוכב הוא מחלקה־סוכן, מקשיב בלחיצת כפתור,
מתחקר אותך ב־5 שאלות מדויקות על כל רעיון — ואז בונה אותו:

- **מסלול א** — בונה ופורס לבד ל־GitHub Pages (קישור חי בדקות)
- **מסלול ב** — מגיש אפיון מלא + פרומפט בנייה מושלם

## הרצה מקומית

```bash
npm install
npm run dev
```

## חיבור Convex (זיכרון משותף בין מכשירים)

```bash
npx convex login        # פעם אחת, עם חשבון yairosbrain
npx convex dev          # יוצר פרויקט ומדפיס VITE_CONVEX_URL ל-.env.local
```

בלי Convex האפליקציה עובדת במצב מקומי (localStorage) — הכול עובד, רק בלי סנכרון בין מכשירים.

## פריסה ל-Vercel

```bash
npm run build
vercel --prod
```

אם חיברת Convex — הוסף את `VITE_CONVEX_URL` גם ב-Vercel (Environment Variables) והרץ
`npx convex deploy` לפריסת פונקציות production.

## מפתחות (בהגדרות בתוך האפליקציה)

- **Puter** (ברירת מחדל) — בלי מפתח. בפעם הראשונה קופץ חלון התחברות לחשבון Puter.
- **Gemini** — מפתח חינמי מ־Google AI Studio.
- **Claude API** — מפתח בתשלום מ־Anthropic.
- **GitHub Token** — למסלול א: טוקן עם הרשאות Contents + Pages + Administration
  (או classic token עם scope `repo`).

כל המפתחות נשמרים **רק ב-localStorage של המכשיר** — אף פעם לא בקוד, לא ב-git, לא ב-Convex.

## ארכיטקטורה

ראה `YAIROS-ARCHITECTURE.md` — מסמך הארכיטקטורה המלא (גרסה 1.0).

```
src/
├─ app/          # המסכים: Boot, Galaxy, Transcript, Settings
├─ galaxy/       # Three.js — כוכבים, קווים, אפקטים
├─ brain/        # askBrain() + ספקים: puter | gemini | claude
├─ agents/       # registry + פרומפטים של 6 המחלקות
├─ core/         # YAIROS CORE — המנצח על ה-pipeline
├─ voice/        # Web Speech API — STT + TTS
├─ deploy/       # GitHub REST — ריפו + Pages ממסלול א
├─ data/         # Convex / localStorage — אותו ממשק
└─ i18n/         # he | en, RTL/LTR
convex/          # schema + פונקציות
```

---

*Y.A.I.R.O.S — נבנה על ידי יאיר + Claude.*
