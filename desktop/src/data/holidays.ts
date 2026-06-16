import { Solar, Lunar } from "lunar-typescript";

// ─── Types ─────────────────────────────────────────────────

export type HolidayRegion = "cn" | "intl";

export interface Holiday {
  id: string;
  name: string;
  /** English holiday name */
  nameEn: string;
  /** Region: "cn" = Chinese-specific, "intl" = International */
  region: HolidayRegion;
  /** Solar calendar: month (1-12) */
  solarMonth?: number;
  /** Solar calendar: day (1-31) */
  solarDay?: number;
  /** Lunar calendar: month (1-12) */
  lunarMonth?: number;
  /** Lunar calendar: day (1-30) */
  lunarDay?: number;
  /** Whether this is a solar term (节气) */
  isSolarTerm?: boolean;
  /** Built-in fallback greetings (Chinese) */
  greetingsZh: string[];
  /** Built-in fallback greetings (English) */
  greetingsEn: string[];
}

// ─── Holiday Definitions ───────────────────────────────────

export const HOLIDAYS: Holiday[] = [
  // ── International solar calendar holidays ──
  {
    id: "new-year",
    name: "元旦",
    nameEn: "New Year's Day",
    region: "intl",
    solarMonth: 1, solarDay: 1,
    greetingsZh: ["新年快乐，万事如意！", "新的一年，新的开始！", "元旦快乐，愿一切美好如期而至！"],
    greetingsEn: ["Happy New Year!", "A fresh start for a new year!", "Wishing you joy in the new year!"],
  },
  {
    id: "valentines",
    name: "情人节",
    nameEn: "Valentine's Day",
    region: "intl",
    solarMonth: 2, solarDay: 14,
    greetingsZh: ["情人节快乐，愿爱情甜蜜！", "今天是被爱包围的一天~", "有爱的日子，每天都是情人节！"],
    greetingsEn: ["Happy Valentine's Day!", "Love is in the air today!", "Wishing you a day full of love!"],
  },
  {
    id: "womens-day",
    name: "妇女节",
    nameEn: "Women's Day",
    region: "intl",
    solarMonth: 3, solarDay: 8,
    greetingsZh: ["女神节快乐！", "致敬每一位了不起的女性！", "今天你最美！"],
    greetingsEn: ["Happy Women's Day!", "Celebrating amazing women!", "You shine bright today!"],
  },
  {
    id: "labor-day",
    name: "劳动节",
    nameEn: "Labor Day",
    region: "intl",
    solarMonth: 5, solarDay: 1,
    greetingsZh: ["劳动节快乐，辛苦了！", "休息也是为了更好地出发~", "五一快乐，享受假期吧！"],
    greetingsEn: ["Happy Labor Day!", "Take a well-deserved break!", "Enjoy the holiday!"],
  },
  {
    id: "childrens-day",
    name: "儿童节",
    nameEn: "Children's Day",
    region: "intl",
    solarMonth: 6, solarDay: 1,
    greetingsZh: ["六一快乐，保持童心！", "愿你永远像孩子一样快乐！", "大人也要过儿童节呀~"],
    greetingsEn: ["Happy Children's Day!", "Stay young at heart!", "Keep that childlike joy!"],
  },
  {
    id: "teachers-day",
    name: "教师节",
    nameEn: "Teachers' Day",
    region: "cn",
    solarMonth: 9, solarDay: 10,
    greetingsZh: ["教师节快乐，感恩有你！", "师恩难忘，祝老师节日快乐！", "谢谢你的教导和陪伴！"],
    greetingsEn: ["Happy Teachers' Day!", "Thank you for your guidance!", "Grateful for great teachers!"],
  },
  {
    id: "national-day",
    name: "国庆节",
    nameEn: "National Day",
    region: "cn",
    solarMonth: 10, solarDay: 1,
    greetingsZh: ["国庆快乐，祖国生日快乐！", "欢度国庆，享受假期！", "祝祖国繁荣昌盛！"],
    greetingsEn: ["Happy National Day!", "Enjoy the National Day holiday!", "Celebrating our great nation!"],
  },
  {
    id: "christmas-eve",
    name: "平安夜",
    nameEn: "Christmas Eve",
    region: "intl",
    solarMonth: 12, solarDay: 24,
    greetingsZh: ["平安夜，愿你平安喜乐！", "今夜，愿温暖与你同在~", "平安夜快乐，吃个苹果吧！"],
    greetingsEn: ["Merry Christmas Eve!", "Wishing you peace tonight!", "Warm wishes on this special night!"],
  },
  {
    id: "christmas",
    name: "圣诞节",
    nameEn: "Christmas",
    region: "intl",
    solarMonth: 12, solarDay: 25,
    greetingsZh: ["圣诞快乐！", "叮叮当~圣诞节快乐！", "愿圣诞的温暖陪你度过冬天！"],
    greetingsEn: ["Merry Christmas!", "Ho ho ho! Merry Christmas!", "Wishing you a magical Christmas!"],
  },

  // ── Chinese lunar calendar holidays ──
  {
    id: "spring-festival",
    name: "春节",
    nameEn: "Chinese New Year",
    region: "cn",
    lunarMonth: 1, lunarDay: 1,
    greetingsZh: ["新年快乐，恭喜发财！", "新春大吉，万事如意！", "过年好，祝阖家幸福！"],
    greetingsEn: ["Happy Chinese New Year!", "Wishing you prosperity!", "Gong Xi Fa Cai!"],
  },
  {
    id: "lantern-festival",
    name: "元宵节",
    nameEn: "Lantern Festival",
    region: "cn",
    lunarMonth: 1, lunarDay: 15,
    greetingsZh: ["元宵节快乐，团团圆圆！", "吃碗汤圆，甜甜蜜蜜~", "花灯璀璨，元宵快乐！"],
    greetingsEn: ["Happy Lantern Festival!", "Wishing you sweetness and reunion!", "Enjoy the lantern glow!"],
  },
  {
    id: "qingming",
    name: "清明节",
    nameEn: "Qingming Festival",
    region: "cn",
    isSolarTerm: true,
    greetingsZh: ["清明时节，缅怀先人", "春风送暖，珍惜当下", "清明安康"],
    greetingsEn: ["Qingming Festival", "Cherish every moment", "Peace on this Qingming day"],
  },
  {
    id: "dragon-boat",
    name: "端午节",
    nameEn: "Dragon Boat Festival",
    region: "cn",
    lunarMonth: 5, lunarDay: 5,
    greetingsZh: ["端午安康，粽子节快乐！", "五月五，过端午~", "吃粽子，赛龙舟，端午快乐！"],
    greetingsEn: ["Happy Dragon Boat Festival!", "Enjoy the zongzi!", "Wishing you health and happiness!"],
  },
  {
    id: "qixi",
    name: "七夕节",
    nameEn: "Qixi Festival",
    region: "cn",
    lunarMonth: 7, lunarDay: 7,
    greetingsZh: ["七夕快乐，中国情人节快乐！", "鹊桥相会，愿有情人终成眷属~", "今天也是被爱情围绕的一天！"],
    greetingsEn: ["Happy Qixi Festival!", "Wishing you love and happiness!", "A day for romance!"],
  },
  {
    id: "mid-autumn",
    name: "中秋节",
    nameEn: "Mid-Autumn Festival",
    region: "cn",
    lunarMonth: 8, lunarDay: 15,
    greetingsZh: ["中秋快乐，月圆人团圆！", "月饼配月亮，绝配~", "但愿人长久，千里共婵娟！"],
    greetingsEn: ["Happy Mid-Autumn Festival!", "Wishing you reunion and joy!", "May the full moon bring happiness!"],
  },
  {
    id: "double-ninth",
    name: "重阳节",
    nameEn: "Double Ninth Festival",
    region: "cn",
    lunarMonth: 9, lunarDay: 9,
    greetingsZh: ["重阳节快乐，登高望远！", "九九重阳，健康长寿！", "秋风送爽，重阳安康！"],
    greetingsEn: ["Happy Double Ninth Festival!", "Wishing you health and longevity!", "Enjoy the autumn breeze!"],
  },
  {
    id: "new-years-eve",
    name: "除夕",
    nameEn: "Lunar New Year's Eve",
    region: "cn",
    lunarMonth: 12, lunarDay: 30,
    greetingsZh: ["除夕快乐，阖家团圆！", "辞旧迎新，新年倒计时~", "年夜饭吃起来！除夕快乐！"],
    greetingsEn: ["Happy New Year's Eve!", "Wishing you family reunion!", "Ring in the new year!"],
  },
];

// ─── Detection Logic ───────────────────────────────────────

/**
 * Check if today is a holiday.
 * @param enabledRegions - Array of enabled region filters. Pass [] to disable all.
 *                         Defaults to ["cn", "intl"] (all holidays).
 * Returns the matched Holiday or null.
 */
export function getTodayHoliday(enabledRegions: HolidayRegion[] = ["cn", "intl"]): Holiday | null {
  const now = new Date();
  const solar = Solar.fromDate(now);
  const lunar = Lunar.fromDate(now);

  for (const h of HOLIDAYS) {
    // Skip holidays in disabled regions
    if (!enabledRegions.includes(h.region)) continue;
    // Check solar term holidays (e.g., 清明)
    if (h.isSolarTerm) {
      const currentJieQi = lunar.getCurrentJieQi();
      if (currentJieQi) {
        // Match by name prefix: "清明" matches "清明节"
        const jieQiName = currentJieQi.getName();
        if (h.name.startsWith(jieQiName) || jieQiName.startsWith(h.name.replace(/节$/, ""))) {
          return h;
        }
      }
    }

    // Check solar calendar holidays
    if (h.solarMonth !== undefined && h.solarDay !== undefined) {
      if (solar.getMonth() === h.solarMonth && solar.getDay() === h.solarDay) {
        return h;
      }
    }

    // Check lunar calendar holidays
    if (h.lunarMonth !== undefined && h.lunarDay !== undefined) {
      // Handle 除夕 special case: last day of lunar year
      if (h.id === "new-years-eve") {
        // 除夕 is the last day of the lunar month 12
        // Check if tomorrow is 春节 (lunar 1/1)
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowLunar = Lunar.fromDate(tomorrow);
        if (tomorrowLunar.getMonth() === 1 && tomorrowLunar.getDay() === 1) {
          return h;
        }
      } else {
        if (lunar.getMonth() === h.lunarMonth && lunar.getDay() === h.lunarDay) {
          return h;
        }
      }
    }
  }

  return null;
}

/**
 * Get a random fallback greeting for a holiday.
 */
export function getRandomGreeting(holiday: Holiday, lang: "zh" | "en"): string {
  const greetings = lang === "zh" ? holiday.greetingsZh : holiday.greetingsEn;
  return greetings[Math.floor(Math.random() * greetings.length)];
}

/**
 * Get the localized holiday name.
 */
export function getHolidayName(holiday: Holiday, lang: "zh" | "en"): string {
  return lang === "en" ? holiday.nameEn : holiday.name;
}
