# Qalb — Firebase committed config (fallback)
#
# Is folder me login ke liye zaroori PUBLIC identifiers reh sakte hain,
# sirf tab jab GitHub Variables (FIREBASE_WEB_API_KEY / GOOGLE_CLIENT_ID)
# set na hon.
#
# web-apikey.txt — Firebase Web API Key (AIzaSy...)
#   • Ye SECRET NAHI hai — har Firebase web app ke JS bundle me publicly
#     hota hai. Security Firebase restrictions + Firestore rules se aati hai.
#   • Firebase console > Project settings (qalb-app1) > General > Web API Key
#   • Pehli line par sirf key, koi space/quote nahi.
#
# google-client-id.txt — OAuth 2.0 Web Client ID (...apps.googleusercontent.com)
#   • Ye bhi public identifier hai. Google login ke liye.
#
# NOTE: Prefer GitHub Variables (repo Settings > Secrets and variables >
# Actions > Variables) — file fallback unke baad hi chalti hai.
