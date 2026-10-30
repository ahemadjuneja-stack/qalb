'use client';
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarView = CalendarView;
// Qalb — Calendar Tab: PrayerTimes-style dashboard
// ── HERO: circular tick-countdown (agli namaz) + Hijri/Gregorian dates +
//    Qibla compass (timer ke niche — user request) — night-mosque card
// ── TABS: Fard Times / Other Times / Tasbih
// ── FARD: Fajr ka start—end (Tulu-e-Aftab tak, red) — screenshot style
// SUNNI HANAFI (India): method=1 (Fajr/Isha 18°) + school=1 (HANAFI Asr)
// LOCATION: FIXED JUNAGADH (Gujarat) — city selector hata diya gaya (user request)
// Hijri: GUJARAT CHAND COMMITTEE (gujchand.com) auto — offline par last-sync cache,
// unavailable hone par umalqura + local ruyat adjust (user +/- se align kar sakta hai)
var react_1 = require("react");
var lucide_react_1 = require("lucide-react");
var qalb_1 = require("@/lib/qalb");
var gujchand_1 = require("@/lib/gujchand");
var tasbih_counter_1 = require("./tasbih-counter");
var HIJRI_ADJUST_KEY = 'qalb_hijri_adjust_v1';
// LOCATION: FIXED JUNAGADH — app hamesha Junagadh (Gujarat) ke auqaat dikhayegi
var LOCATION = qalb_1.PRAYER_CITIES[0];
// Kaaba (Haram Sharif) — Qibla bearing calculate karne ke liye
var KAABA = { lat: 21.422487, lng: 39.826206 };
var PRAYER_ORDER = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
var PRAYER_ICONS = {
    Fajr: lucide_react_1.Sunrise,
    Dhuhr: lucide_react_1.Sun,
    Asr: lucide_react_1.Sunset,
    Maghrib: lucide_react_1.Moon,
    Isha: lucide_react_1.CloudMoon,
};
var PRAYER_NAMES_UR = {
    Fajr: 'Fajr',
    Dhuhr: 'Zuhr',
    Asr: 'Asr',
    Maghrib: 'Maghrib',
    Isha: 'Isha',
};
var CAL_TABS = [
    { key: 'fard', label: 'Fard Times' },
    { key: 'other', label: 'Other Times' },
    { key: 'tasbih', label: 'Tasbih' },
];
// ── helpers ─────────────────────────────────────────────────────────────
function parseTime(t) {
    var m = t.match(/(\d{1,2}):(\d{2})/);
    return m ? "".concat(m[1].padStart(2, '0'), ":").concat(m[2]) : t;
}
function toMin(hhmm) {
    var _a = hhmm.split(':').map(Number), h = _a[0], m = _a[1];
    return h * 60 + m;
}
/** "05:34" → { time: "05:34", ampm: "AM" } (12h display ke liye) */
function fmt12(hhmm) {
    var m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
    if (!m)
        return { time: hhmm, ampm: '' };
    var h = Number(m[1]);
    var min = m[2];
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return { time: "".concat(String(h12).padStart(2, '0'), ":").concat(min), ampm: ampm };
}
function addMin(hhmm, delta) {
    var m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
    if (!m)
        return hhmm;
    var total = (Number(m[1]) * 60 + Number(m[2]) + delta + 1440) % 1440;
    return "".concat(String(Math.floor(total / 60)).padStart(2, '0'), ":").concat(String(total % 60).padStart(2, '0'));
}
/** Qibla bearing (initial great-circle bearing, North=0°) Junagadh → Kaaba */
function qiblaBearing(fromLat, fromLng) {
    var p1 = (fromLat * Math.PI) / 180;
    var p2 = (KAABA.lat * Math.PI) / 180;
    var dl = ((KAABA.lng - fromLng) * Math.PI) / 180;
    var y = Math.sin(dl) * Math.cos(p2);
    var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
var COMPASS_UR = [
    'Shumal (N)',
    'Shumal-Mashriq (NE)',
    'Mashriq (E)',
    'Junub-Mashriq (SE)',
    'Junub (S)',
    'Junub-Maghrib (SW)',
    'Maghrib (W)',
    'Shumal-Maghrib (NW)',
];
function compassLabel(deg) {
    return COMPASS_UR[Math.round(deg / 45) % 8];
}
function hijriWithAdjust(offsetDays) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
        // Offset gregorian date pe apply hota hai → Intl islamic calendar se
        // hijri nikalta hai (saare month/year rollover automatic handle)
        var target = new Date();
        target.setDate(target.getDate() + offsetDays);
        var parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }).formatToParts(target);
        var day = (_b = (_a = parts.find(function (p) { return p.type === 'day'; })) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : '';
        var monthEn = (_d = (_c = parts.find(function (p) { return p.type === 'month'; })) === null || _c === void 0 ? void 0 : _c.value) !== null && _d !== void 0 ? _d : '';
        var year = (_f = (_e = parts.find(function (p) { return p.type === 'year'; })) === null || _e === void 0 ? void 0 : _e.value) !== null && _f !== void 0 ? _f : '';
        // numeric month (badge ke liye)
        var numParts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
            month: 'numeric',
        }).formatToParts(target);
        var monthNumber = Number((_h = (_g = numParts.find(function (p) { return p.type === 'month'; })) === null || _g === void 0 ? void 0 : _g.value) !== null && _h !== void 0 ? _h : 0);
        return {
            day: day,
            monthNumber: monthNumber,
            monthEn: monthEn,
            monthAr: '',
            year: year,
            // hijri weekday = aaj ka hi din hai (shifted date ka nahi)
            weekdayEn: new Intl.DateTimeFormat('en', { weekday: 'long' }).format(new Date()),
            designation: 'Islamic calendar (local ruyat adjust)',
        };
    }
    catch (_j) {
        return {
            day: '—',
            monthNumber: 0,
            monthEn: 'Hijri',
            monthAr: '',
            year: '',
            weekdayEn: '',
            designation: '',
        };
    }
}
var GREG_FMT = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
});
// ── countdown ring (tick style — screenshot jaisa) ──────────────────────
function CountdownRing(_a) {
    var frac = _a.frac, children = _a.children;
    var TICKS = 60;
    var remainingTicks = Math.round(Math.max(0, Math.min(1, frac)) * TICKS);
    return (<div className="relative h-[128px] w-[128px] shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden>
        {Array.from({ length: TICKS }, function (_, i) {
            var long = i % 5 === 0;
            var a = ((i * 6 - 90) * Math.PI) / 180;
            var rOuter = 57;
            var rInner = long ? 49 : 52;
            var isRemaining = i >= TICKS - remainingTicks;
            return (<line key={i} x1={60 + rInner * Math.cos(a)} y1={60 + rInner * Math.sin(a)} x2={60 + rOuter * Math.cos(a)} y2={60 + rOuter * Math.sin(a)} stroke={isRemaining ? '#fb7185' : 'rgba(255,255,255,0.82)'} strokeWidth={isRemaining ? 2.5 : long ? 1.9 : 1.1} strokeLinecap="round"/>);
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>);
}
// ── qibla compass (map-style — N upar, needle Qibla ki taraf) ───────────
function QiblaCompass(_a) {
    var deg = _a.deg;
    return (<svg viewBox="0 0 96 96" className="h-[78px] w-[78px] shrink-0" aria-hidden>
      <circle cx="48" cy="48" r="45" fill="rgba(0,0,0,0.30)" stroke="rgba(255,255,255,0.22)" strokeWidth="1.4"/>
      {Array.from({ length: 24 }, function (_, i) {
            var a = (i * 15 * Math.PI) / 180;
            var long = i % 6 === 0;
            var r1 = long ? 35 : 39;
            return (<line key={i} x1={48 + r1 * Math.sin(a)} y1={48 - r1 * Math.cos(a)} x2={48 + 42 * Math.sin(a)} y2={48 - 42 * Math.cos(a)} stroke={long ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)'} strokeWidth={long ? 1.6 : 1} strokeLinecap="round"/>);
        })}
      <text x="48" y="17" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#fb7185">
        N
      </text>
      <text x="83" y="51.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.55)">
        E
      </text>
      <text x="48" y="88" textAnchor="middle" fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.55)">
        S
      </text>
      <text x="13" y="51.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.55)">
        W
      </text>
      <g transform={"rotate(".concat(deg, " 48 48)")}>
        <polygon points="48,13 42.5,50 53.5,50" fill="#fb7185"/>
        <polygon points="48,86 42.5,50 53.5,50" fill="rgba(255,255,255,0.20)"/>
        <circle cx="48" cy="20" r="6" fill="none" stroke="#fecdd3" strokeWidth="1.2"/>
      </g>
      <circle cx="48" cy="48" r="3" fill="rgba(255,255,255,0.9)"/>
    </svg>);
}
// ── main view ───────────────────────────────────────────────────────────
function CalendarView() {
    var _this = this;
    var _a = (0, react_1.useState)(null), data = _a[0], setData = _a[1];
    var _b = (0, react_1.useState)(true), loading = _b[0], setLoading = _b[1];
    var _c = (0, react_1.useState)(function () { return new Date(); }), now = _c[0], setNow = _c[1];
    var _d = (0, react_1.useState)('fard'), tab = _d[0], setTab = _d[1];
    // GUJARAT CHAND COMMITTEE hijri — auto (gujchand.com)
    var _e = (0, react_1.useState)(null), gujchand = _e[0], setGujchand = _e[1];
    // fallback: Sunni Hanafi local ruyat adjust — Hindustan me chand aksar 1 din baad
    var _f = (0, react_1.useState)(-1), hijriAdjust = _f[0], setHijriAdjust = _f[1];
    (0, react_1.useEffect)(function () {
        // saved hijri adjust load karo
        var t = setTimeout(function () {
            try {
                var raw = window.localStorage.getItem(HIJRI_ADJUST_KEY);
                if (raw !== null && !Number.isNaN(Number(raw)))
                    setHijriAdjust(Number(raw));
            }
            catch (_a) {
                /* default -1 */
            }
        }, 0);
        return function () { return clearTimeout(t); };
    }, []);
    (0, react_1.useEffect)(function () {
        // adjust change → persist
        try {
            window.localStorage.setItem(HIJRI_ADJUST_KEY, String(hijriAdjust));
        }
        catch (_a) {
            /* ignore */
        }
    }, [hijriAdjust]);
    var fetchPrayerData = (0, react_1.useCallback)(function (city) { return __awaiter(_this, void 0, void 0, function () {
        var now_1, dmy, coordQuery, url, res, json, d, timings, hijri, _a;
        var _b, _c, _d, _e, _f, _g, _h, _j;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0:
                    setLoading(true);
                    _k.label = 1;
                case 1:
                    _k.trys.push([1, 4, 5, 6]);
                    now_1 = new Date();
                    dmy = "".concat(String(now_1.getDate()).padStart(2, '0'), "-").concat(String(now_1.getMonth() + 1).padStart(2, '0'), "-").concat(now_1.getFullYear());
                    coordQuery = "latitude=".concat(city.lat, "&longitude=").concat(city.lng, "&method=1&school=1");
                    url = "https://api.aladhan.com/v1/timings/".concat(dmy, "?").concat(coordQuery);
                    return [4 /*yield*/, fetch(url, { signal: AbortSignal.timeout(10000) })];
                case 2:
                    res = _k.sent();
                    if (!res.ok)
                        throw new Error('aladhan failed');
                    return [4 /*yield*/, res.json()];
                case 3:
                    json = _k.sent();
                    d = json === null || json === void 0 ? void 0 : json.data;
                    if (!(d === null || d === void 0 ? void 0 : d.timings))
                        throw new Error('no data');
                    timings = {
                        Fajr: parseTime(d.timings.Fajr),
                        Sunrise: parseTime(d.timings.Sunrise),
                        Dhuhr: parseTime(d.timings.Dhuhr),
                        Asr: parseTime(d.timings.Asr),
                        Maghrib: parseTime(d.timings.Maghrib),
                        Isha: parseTime(d.timings.Isha),
                        // extended auqaat (Other Times tab)
                        Imsak: parseTime((_b = d.timings.Imsak) !== null && _b !== void 0 ? _b : ''),
                        Midnight: parseTime((_c = d.timings.Midnight) !== null && _c !== void 0 ? _c : ''),
                        Lastthird: parseTime((_d = d.timings.Lastthird) !== null && _d !== void 0 ? _d : ''),
                    };
                    hijri = hijriWithAdjust(0) // placeholder — render par gujchand/adjust override karta hai
                    ;
                    setData({
                        timings: timings,
                        hijri: hijri,
                        gregorian: (_g = (_f = (_e = d.date) === null || _e === void 0 ? void 0 : _e.gregorian) === null || _f === void 0 ? void 0 : _f.date) !== null && _g !== void 0 ? _g : '',
                        timezone: (_j = (_h = d.meta) === null || _h === void 0 ? void 0 : _h.timezone) !== null && _j !== void 0 ? _j : 'Asia/Kolkata',
                        city: "".concat(city.city, ", ").concat(city.country),
                    });
                    return [3 /*break*/, 6];
                case 4:
                    _a = _k.sent();
                    // offline fallback — static approximate timings (Junagadh base)
                    setData({
                        timings: {
                            Fajr: '05:15',
                            Sunrise: '06:35',
                            Dhuhr: '12:30',
                            Asr: '16:00',
                            Maghrib: '18:10',
                            Isha: '19:30',
                            Imsak: '05:05',
                            Midnight: '00:52',
                            Lastthird: '02:09',
                        },
                        hijri: hijriWithAdjust(0),
                        gregorian: new Date().toLocaleDateString('en-GB'),
                        timezone: 'Asia/Kolkata',
                        city: "".concat(city.city, ", ").concat(city.country),
                    });
                    return [3 /*break*/, 6];
                case 5:
                    setLoading(false);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); }, []);
    // GUJARAT CHAND COMMITTEE — live hijri fetch (gujchand.com)
    (0, react_1.useEffect)(function () {
        var stale = false;
        (0, gujchand_1.getGujchandHijri)()
            .then(function (h) {
            if (!stale && h)
                setGujchand(h);
        })
            .catch(function () {
            /* fallback ruyat adjust chalta rahega */
        });
        return function () {
            stale = true;
        };
    }, []);
    (0, react_1.useEffect)(function () {
        void fetchPrayerData(LOCATION);
    }, [fetchPrayerData]);
    // live clock
    (0, react_1.useEffect)(function () {
        var t = setInterval(function () { return setNow(new Date()); }, 1000);
        return function () { return clearInterval(t); };
    }, []);
    // next prayer + countdown + ring progress
    var _g = (0, react_1.useMemo)(function () {
        var _a, _b;
        if (!data)
            return { nextPrayer: null, countdown: '--:--:--', targetTime: null, remainingFrac: 0 };
        var mkAt = function (name, dayOffset) {
            var _a;
            if (dayOffset === void 0) { dayOffset = 0; }
            var _b = ((_a = data.timings[name]) !== null && _a !== void 0 ? _a : '').split(':').map(Number), h = _b[0], m = _b[1];
            var d = new Date(now);
            d.setDate(d.getDate() + dayOffset);
            d.setHours(h, m, 0, 0);
            return d;
        };
        var cycle = [
            { name: 'Fajr', at: mkAt('Fajr') },
            { name: 'Dhuhr', at: mkAt('Dhuhr') },
            { name: 'Asr', at: mkAt('Asr') },
            { name: 'Maghrib', at: mkAt('Maghrib') },
            { name: 'Isha', at: mkAt('Isha') },
            { name: 'Fajr', at: mkAt('Fajr', 1) },
        ].sort(function (a, b) { return a.at.getTime() - b.at.getTime(); });
        var next = (_a = cycle.find(function (p) { return p.at > now; })) !== null && _a !== void 0 ? _a : cycle[cycle.length - 1];
        var idx = cycle.indexOf(next);
        // prev prayer = cycle me next se pehle wala; subah (Fajr se pehle) Isha kal ka
        var prev = (_b = (idx > 0 ? cycle[idx - 1] : undefined)) !== null && _b !== void 0 ? _b : { name: 'Isha', at: mkAt('Isha', -1) };
        var diff = Math.max(0, Math.floor((next.at.getTime() - now.getTime()) / 1000));
        var hh = String(Math.floor(diff / 3600)).padStart(2, '0');
        var mm = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        var ss = String(diff % 60).padStart(2, '0');
        var total = Math.max(1, next.at.getTime() - prev.at.getTime());
        var remaining = Math.max(0, Math.min(1, (next.at.getTime() - now.getTime()) / total));
        return {
            nextPrayer: next.name,
            countdown: "".concat(hh, ":").concat(mm, ":").concat(ss),
            targetTime: next.at,
            remainingFrac: remaining,
        };
    }, [data, now]), nextPrayer = _g.nextPrayer, countdown = _g.countdown, targetTime = _g.targetTime, remainingFrac = _g.remainingFrac;
    // render par hijri: GUJARAT CHAND COMMITTEE (auto) > local ruyat adjust
    var view = (0, react_1.useMemo)(function () {
        if (!data)
            return null;
        if (gujchand) {
            return __assign(__assign({}, data), { hijri: {
                    day: gujchand.day,
                    monthNumber: gujchand.monthNumber,
                    monthEn: gujchand.monthEn,
                    monthAr: '',
                    year: gujchand.year,
                    weekdayEn: new Intl.DateTimeFormat('en', { weekday: 'long' }).format(new Date()),
                    designation: 'Gujarat Chand Committee',
                } });
        }
        return __assign(__assign({}, data), { hijri: hijriWithAdjust(hijriAdjust) });
    }, [data, gujchand, hijriAdjust]);
    var clampAdjust = function (v) { return Math.max(-2, Math.min(2, v)); };
    // Qibla bearing — Junagadh fixed, ek hi baar calculate
    var qibla = (0, react_1.useMemo)(function () { return qiblaBearing(LOCATION.lat, LOCATION.lng); }, []);
    // Other Times — Sehri/Ishraq/Zawal/Chasht/Iftar/Nisf-ul-Layl/Tahajjud
    var otherTimes = (0, react_1.useMemo)(function () {
        var _a, _b, _c;
        if (!view)
            return [];
        var t = view.timings;
        var chashtDelta = Math.round((toMin(t.Dhuhr) - toMin(t.Sunrise)) / 2);
        return [
            { icon: lucide_react_1.MoonStar, label: 'Sehri Khatam', sub: 'Imsak — roza shuru hone ka waqt', time: (_a = t.Imsak) !== null && _a !== void 0 ? _a : addMin(t.Fajr, -10) },
            { icon: lucide_react_1.Sunrise, label: 'Tulu-e-Aftab', sub: 'Sunrise — Fajr waqt khatam', time: t.Sunrise },
            { icon: lucide_react_1.Sun, label: 'Ishraq', sub: 'Tulu ke ~20 min baad', time: addMin(t.Sunrise, 20) },
            { icon: lucide_react_1.SunDim, label: 'Zawal', sub: 'Zuhr se ~10 min pehle', time: addMin(t.Dhuhr, -10) },
            { icon: lucide_react_1.CloudSun, label: 'Chasht (Duha)', sub: 'Ishraq ke baad, Zuhr se pehle', time: addMin(t.Sunrise, chashtDelta) },
            { icon: lucide_react_1.Sunset, label: 'Iftari (Maghrib)', sub: 'Roza kholne ka waqt', time: t.Maghrib },
            { icon: lucide_react_1.Moon, label: 'Nisf-ul-Layl', sub: 'Sharahi aadhi raat', time: (_b = t.Midnight) !== null && _b !== void 0 ? _b : '—' },
            { icon: lucide_react_1.Sparkles, label: 'Tahajjud', sub: 'Raat ka aakhri teesra hissa', time: (_c = t.Lastthird) !== null && _c !== void 0 ? _c : '—' },
        ];
    }, [view]);
    return (<div className="space-y-4 px-4 pb-8 pt-5">
      {/* header */}
      <header>
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-emerald-50">
          <lucide_react_1.MoonStar className="h-5 w-5 text-emerald-400"/> Islamic Calendar
          <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
            Sunni Hanafi
          </span>
        </h1>
        <p className="text-xs text-emerald-200/50">Hijri date, namaz ke auqaat, Qibla aur tasbih</p>
      </header>

      {loading ? (<div className="flex h-56 items-center justify-center">
          <lucide_react_1.Loader2 className="h-7 w-7 animate-spin text-emerald-400"/>
        </div>) : view ? (<>
          {/* ── HERO: countdown ring + dates + qibla (night mosque card) ── */}
          <section aria-label="Namaz dashboard" className="relative overflow-hidden rounded-3xl p-5 text-white shadow-[0_18px_50px_-18px_rgba(0,0,0,0.55)]" style={{ background: 'linear-gradient(168deg, #14503a 0%, #0d3123 52%, #071e15 100%)' }}>
            {/* mosque skyline — decorative */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 opacity-[0.13]">
              <svg viewBox="0 0 400 80" className="block w-full">
                <rect x="198.75" y="10" width="2.5" height="12" fill="#d9fbe9"/>
                <path fill="#d9fbe9" d="M0 80 V62 H60 V30 Q66 19 72 30 V50 H160 A40 30 0 0 1 240 50 H328 V30 Q334 19 340 30 V62 H400 V80 Z"/>
              </svg>
            </div>

            {/* countdown ring + dates */}
            <div className="relative flex items-center gap-4">
              <CountdownRing frac={remainingFrac}>
                <p className="text-[13px] font-extrabold text-rose-300">
                  {nextPrayer ? PRAYER_NAMES_UR[nextPrayer] : '—'}
                </p>
                <p className="font-mono text-[19px] font-extrabold leading-tight tabular-nums">{countdown}</p>
                <p className="text-[8.5px] font-bold uppercase tracking-[0.2em] text-white/45">baaki</p>
              </CountdownRing>

              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <lucide_react_1.MoonStar className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"/>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-extrabold leading-tight">
                      {view.hijri.day} {view.hijri.monthEn}, {view.hijri.year}
                    </p>
                    <p className="flex items-center gap-1 text-[9.5px] font-medium text-white/50">
                      {gujchand && <lucide_react_1.BadgeCheck className="h-3 w-3 text-amber-300"/>}
                      {gujchand
                ? "Gujarat Chand Committee".concat(gujchand.source === 'cache' ? ' (last sync)' : '')
                : 'Local ruyat adjust'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <lucide_react_1.CalendarDays className="h-4 w-4 shrink-0 text-white/60"/>
                  <p className="text-[13px] font-semibold text-white/90">{GREG_FMT.format(now)}</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <lucide_react_1.MapPin className="h-4 w-4 shrink-0 text-white/60"/>
                  <p className="truncate text-[12px] font-medium text-white/70">
                    {LOCATION.city}, Gujarat (IST)
                  </p>
                </div>
              </div>
            </div>

            {/* chand adjust — jab gujchand available na ho */}
            {!gujchand && (<div className="relative mt-3 flex items-center gap-2.5 rounded-xl bg-black/20 px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-white/70">
                  Chand adjust
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={function () { return setHijriAdjust(function (a) { return clampAdjust(a - 1); }); }} disabled={hijriAdjust <= -2} className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/25 text-sm font-bold text-white transition hover:bg-black/40 disabled:opacity-30" aria-label="Hijri date ek din peeche">
                    −
                  </button>
                  <span className="min-w-9 text-center font-mono text-xs font-bold">
                    {hijriAdjust > 0 ? "+".concat(hijriAdjust) : hijriAdjust}
                  </span>
                  <button type="button" onClick={function () { return setHijriAdjust(function (a) { return clampAdjust(a + 1); }); }} disabled={hijriAdjust >= 2} className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/25 text-sm font-bold text-white transition hover:bg-black/40 disabled:opacity-30" aria-label="Hijri date ek din aage">
                    +
                  </button>
                </div>
              </div>)}

            {/* ── QIBLA — timer ke niche (user request) ── */}
            <div className="relative mt-4 flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <QiblaCompass deg={qibla}/>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-300">
                  Qibla Disha
                </p>
                <p className="text-[15px] font-extrabold">
                  {Math.round(qibla)}° • {compassLabel(qibla)}
                </p>
                <p className="mt-0.5 text-[9.5px] leading-snug text-white/50">
                  Kaaba Sharif ki taraf — map-style (N upar). Junagadh me Qibla Maghrib ke qareeb
                  hai.
                </p>
              </div>
            </div>
          </section>

          {/* ── tabs ── */}
          <div className="flex justify-center">
            <div className="card-surface inline-flex items-center gap-1 rounded-full p-1.5" role="tablist">
              {CAL_TABS.map(function (t) { return (<button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={function () { return setTab(t.key); }} className={"rounded-full px-4 py-2 text-[12.5px] font-bold transition ".concat(tab === t.key
                    ? 'emerald-gradient text-emerald-950 shadow-[0_6px_18px_-6px_var(--glow)]'
                    : 'text-emerald-200/50 hover:text-emerald-100')}>
                  {t.label}
                </button>); })}
            </div>
          </div>

          {/* ── FARD TIMES ── */}
          {tab === 'fard' && (<section aria-label="Fard namaz timings" className="grid grid-cols-1 gap-2">
              {PRAYER_ORDER.map(function (name) {
                    var _a;
                    var Icon = PRAYER_ICONS[name];
                    var isNext = nextPrayer === name;
                    var main = fmt12((_a = view.timings[name]) !== null && _a !== void 0 ? _a : '');
                    var isFajr = name === 'Fajr';
                    // Fajr ka waqt Tulu-e-Aftab (Sunrise) tak — screenshot style red end
                    var end = isFajr ? fmt12(view.timings.Sunrise) : null;
                    return (<div key={name} className={"card-surface flex items-center gap-3 rounded-2xl px-4 py-3 transition ".concat(isNext ? 'border-emerald-400/40 shadow-[0_0_24px_-8px_var(--glow)]' : '')}>
                    <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ".concat(isNext ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-400/5 text-emerald-200/60')}>
                      <Icon className="h-4.5 w-4.5"/>
                    </span>
                    <div className="min-w-0">
                      <p className={"text-sm font-bold ".concat(isNext ? 'text-emerald-300' : 'text-emerald-50')}>
                        {PRAYER_NAMES_UR[name]}
                        {name === 'Asr' || name === 'Isha' ? (<span className="ml-1.5 text-[11px] font-semibold text-emerald-200/40">
                            — Hanafi
                          </span>) : null}
                      </p>
                      {isFajr && (<p className="text-[9.5px] text-rose-400/70">Tulu-e-Aftab tak</p>)}
                    </div>
                    <div className="ml-auto text-right font-mono tabular-nums">
                      {isFajr && end ? (<p className="text-[15px] font-bold text-emerald-100/90">
                          {main.time}{' '}
                          <span className="text-[10px] font-semibold text-emerald-200/40">{main.ampm}</span>
                          <span className="mx-1 text-emerald-200/30">—</span>
                          <span className="text-rose-400">{end.time}</span>{' '}
                          <span className="text-[10px] font-semibold text-rose-400/60">{end.ampm}</span>
                        </p>) : (<p className={"text-[15px] font-bold ".concat(isNext ? 'text-emerald-300' : 'text-emerald-100/80')}>
                          {main.time}{' '}
                          <span className="text-[10px] font-semibold opacity-50">{main.ampm}</span>
                        </p>)}
                    </div>
                  </div>);
                })}
            </section>)}

          {/* ── OTHER TIMES ── */}
          {tab === 'other' && (<section aria-label="Other timings" className="grid grid-cols-1 gap-2">
              {otherTimes.map(function (_a) {
                    var Icon = _a.icon, label = _a.label, sub = _a.sub, time = _a.time;
                    var _b = fmt12(time), tm = _b.time, ampm = _b.ampm;
                    return (<div key={label} className="card-surface flex items-center gap-3 rounded-2xl px-4 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
                      <Icon className="h-4 w-4"/>
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-bold text-emerald-50">{label}</p>
                      <p className="text-[9.5px] text-emerald-200/40">{sub}</p>
                    </div>
                    <p className="ml-auto font-mono text-[13.5px] font-bold tabular-nums text-emerald-100/80">
                      {tm} <span className="text-[9px] font-semibold text-emerald-200/40">{ampm}</span>
                    </p>
                  </div>);
                })}
            </section>)}

          {/* ── TASBIH ── */}
          {tab === 'tasbih' && <tasbih_counter_1.TasbihCounter />}

          <p className="text-center text-[10px] text-emerald-200/30">
            Auqaat: Aladhan API — Asr Hanafi method • Hijri:{' '}
            {gujchand ? 'Gujarat Chand Committee' : 'local ruyat adjust'} • Timezone:{' '}
            {view.timezone}
          </p>
        </>) : null}
    </div>);
}
