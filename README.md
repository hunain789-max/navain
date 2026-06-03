# Navain AI — Sales Command Center
AI-powered sales dashboard. Generates USA leads, writes cold emails, manages follow-ups, schedules meetings.
Powered by **Groq (free)** + **EmailJS (free)**.

---

## 🚀 Deploy to Vercel (5 minutes)

### Step 1: Get your FREE Groq API key
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up (free, no credit card)
3. Click **API Keys** → **Create API Key**
4. Copy the key (starts with `gsk_...`)

### Step 2: Push to GitHub
1. Create a new GitHub repo (e.g. `navain-ai-agent`)
2. Upload this entire folder

### Step 3: Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repo
3. Framework: **Next.js** (auto-detected)
4. Click **Deploy**

### Step 4: Add your Groq API key (CRITICAL)
1. Vercel → your project → **Settings → Environment Variables**
2. Add:
   - **Name:** `GROQ_API_KEY`
   - **Value:** `gsk_...` (your Groq key)
3. Click **Save** → then **Redeploy**

---

## 📧 EmailJS Setup (free)

1. Sign up at [emailjs.com](https://emailjs.com) (free tier = 200 emails/month)
2. Connect your Gmail account as an Email Service
3. Create a new Email Template with these variables:
   ```
   {{subject}}  {{to_email}}  {{to_name}}  {{message}}  {{from_name}}  {{reply_to}}
   ```
4. In the dashboard → **Email Sender** tab → **Configure**
5. Enter your Service ID, Template ID, and Public Key

---

## 🗂 Project Structure

```
navain-ai/
├── pages/
│   ├── index.jsx          ← Full React dashboard
│   └── api/
│       └── claude.js      ← Vercel proxy → Groq API (free)
├── package.json
├── next.config.js
└── README.md
```

---

## 🔧 Local Development

```bash
npm install
echo "GROQ_API_KEY=gsk_your_key_here" > .env.local
npm run dev
# Open http://localhost:3000
```

---

## 💡 Groq Free Tier Limits
- 30 requests/minute
- 14,400 requests/day
- No credit card required
- Model: Llama 3.3 70B (very capable for lead gen + email writing)
