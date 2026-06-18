/**
 * Care Tone message library
 * Three styles: warm (温暖治愈), rational (理性陪伴), playful (萌趣幽默)
 * Each category has multiple messages per tone for randomization.
 */

import type { CareTone } from "../types";

type ToneMessages = Record<CareTone, string[]>;

// ─── Hydration ────────────────────────────────────────────

export const hydrationReminder: ToneMessages = {
  warm: [
    "记得喝水哦~保持水分才能元气满满",
    "辛苦啦，先喝杯水休息一下吧",
    "水是生命的源泉~来一杯吧",
    "忙归忙，别忘了喝水呀",
  ],
  rational: [
    "距离上次喝水已有一段时间，建议补充水分",
    "保持每小时 200ml 的饮水量有助于维持专注力",
    "适当饮水可以提升工作效率，建议现在喝一杯",
  ],
  playful: [
    "你的水杯在哭泣！快去拯救它",
    "警告：体内水分不足，即将进入枯萎模式",
    "水是免费的能量饮料，不喝白不喝",
    "听说多喝水能变好看？不信你试试",
  ],
};

export const hydrationCelebration: ToneMessages = {
  warm: [
    "太棒了！今天喝水目标达成啦~继续保持哦",
    "今天的你水水润润的，真棒",
    "喝水小达人！目标完成，为你鼓掌",
  ],
  rational: [
    "今日饮水目标已达成，保持了良好的水分摄入习惯",
    "饮水达标，建议继续保持这个节奏",
  ],
  playful: [
    "恭喜你！水杯家族向你致敬",
    "喝水 MVP！今日成就解锁：水当当",
    "达标啦！你的肾脏给你点了个赞",
  ],
};

// ─── Rest ─────────────────────────────────────────────────

export const restReminder: ToneMessages = {
  warm: [
    "坐了有一会儿啦，站起来活动活动吧~",
    "休息是为了走更长的路，起来伸个懒腰",
    "你的身体在说：我需要动一动啦",
    "暂时放下手中的事，给自己几分钟放松时间",
  ],
  rational: [
    "已持续工作较长时间，建议休息 10-15 分钟",
    "研究表明，定时休息可以提高专注力和效率",
    "久坐不利于健康，建议起身活动一下",
  ],
  playful: [
    "你的椅子快被你坐出包浆了！快起来",
    "再不站起来，你的脊椎要写投诉信了",
    "人体不是机器，需要充电！来，站起来抖一抖",
    "如果你现在站起来，我敬你是条好汉",
  ],
};

// ─── Off-work ─────────────────────────────────────────────

export const offWorkReminder: ToneMessages = {
  warm: [
    "辛苦一天了，收拾一下准备回家吧~",
    "今天也很努力呢，现在是属于你自己的时间啦",
    "工作做完了吗？没关系，明天继续，现在先休息",
  ],
  rational: [
    "已到下班时间，建议合理安排剩余时间",
    "工作告一段落，是时候切换到个人时间了",
  ],
  playful: [
    "下班铃响了！你的沙发在等你回家",
    "电脑说它也累了，你也该走了吧",
    "再不走，今晚的外卖要变成宵夜了",
  ],
};

export const overtimeCare: ToneMessages = {
  warm: [
    "都这么晚了，工作是做不完的，身体更重要哦",
    "夜深了，早点回去吧~明天又是新的一天",
    "加班辛苦了，但也别忘了照顾自己",
  ],
  rational: [
    "已超过正常下班时间，长时间加班会影响第二天的工作状态",
    "建议尽快收尾，保证充足的睡眠对长期效率更重要",
  ],
  playful: [
    "老板又看不到你在加班！快回家吧",
    "你这么拼，公司又不给你分股份（大概）",
    "再不回家，你的床要认别人当主人了",
  ],
};

// ─── Eye Care (20-20-20) ──────────────────────────────────

export const eyeCareReminder: ToneMessages = {
  warm: [
    "让眼睛休息一下吧~看看窗外远处的风景",
    "眼睛也累了，看看远处绿色的东西吧",
    "闭眼 20 秒，给眼睛放个小假",
  ],
  rational: [
    "20-20-20 法则：每 20 分钟，看 20 英尺外的东西 20 秒",
    "建议短暂休息眼睛，预防视觉疲劳",
  ],
  playful: [
    "你的眼睛说它想放假！看看远处吧",
    "屏幕看太久了，你的眼球要罢工了",
    "给眼睛充个电：看远处 20 秒，免费的",
  ],
};

// ─── Mood ─────────────────────────────────────────────────

export const moodCheckinPrompt: ToneMessages = {
  warm: [
    "今天心情怎么样呀？来记录一下吧~",
    "嘿，想知道你今天过得如何",
    "来，选一个最贴近你现在心情的表情吧",
  ],
  rational: [
    "记录一下今天的心情状态",
    "每日心情打卡，有助于关注自身心理健康",
  ],
  playful: [
    "来！给今天的心情打个分吧",
    "你的心情天气预报：请选择当前天气图标",
  ],
};

export const moodResponses: Record<number, ToneMessages> = {
  5: { // 很棒
    warm: ["真好！开心的一天要记住哦~", "看到你心情好，我也很开心呢"],
    rational: ["很好的状态，趁现在高效完成重要任务", "保持积极状态，这是产出最高的时候"],
    playful: ["心情满分！你是今天最闪亮的星", "开心到飞起！保持这个节奏"],
  },
  4: { // 还不错
    warm: ["还不错呀~平平淡淡也是幸福", "稳稳的一天，也很好呢"],
    rational: ["良好的状态，适合处理日常任务", "平稳的心情有助于持续产出"],
    playful: ["稳如老狗，挺好", "普通的一天，但不普通的你"],
  },
  3: { // 一般
    warm: ["一般般也没关系，每天都是新的开始", "累了就歇一歇，不急着赶路"],
    rational: ["中等状态，建议适当休息调整", "可以试试做一些轻松的事情来转换心情"],
    playful: ["一般般？那就来杯奶茶提升一下", "平平无奇的一天...才怪！去搞点事情"],
  },
  2: { // 有点累
    warm: ["辛苦啦，累了就好好休息一下吧", "有时候累了是因为你太努力了，抱抱"],
    rational: ["身体在发出疲劳信号，建议休息或散步", "尝试做几个深呼吸，帮助缓解疲劳感"],
    playful: ["电量不足！建议立刻启动充电模式", "累了？你的身体在说：我需要零食和沙发"],
  },
  1: { // 不太好
    warm: ["抱抱你~不好的时候就让自己慢下来", "没关系，有我在呢。今天早点休息好不好？"],
    rational: ["低潮是正常的，建议做些让自己放松的事", "如果持续低落，建议和信任的人聊聊"],
    playful: ["来，我陪你丧一会儿...然后我们一起振作", "今天允许你当一只咸鱼，明天再翻身"],
  },
};

// ─── Breathing ────────────────────────────────────────────

export const breathingIntro: ToneMessages = {
  warm: ["来，跟我一起做个深呼吸~放松一下", "闭上眼睛，给自己一分钟的宁静"],
  rational: ["深呼吸可以帮助降低压力水平，跟我做", "4-4-6 呼吸法：吸气 4 秒，屏息 4 秒，呼气 6 秒"],
  playful: ["来！跟我一起吸——呼——假装自己在海边", "深呼吸时间！假装自己是一条鱼，然后不是"],
};

export const breathingInhale: ToneMessages = {
  warm: ["吸气...慢慢来", "深深吸...感受空气充满身体"],
  rational: ["吸气...4 秒", "深吸..."],
  playful: ["吸——把好运都吸进来", "吸气...假装在闻火锅"],
};

export const breathingHold: ToneMessages = {
  warm: ["屏住...感受当下", "停在这里...享受这份宁静"],
  rational: ["屏息...4 秒", "保持..."],
  playful: ["憋住！想想你最爱吃的东西", "屏住呼吸...你不是鱼吗？"],
};

export const breathingExhale: ToneMessages = {
  warm: ["呼气...释放所有压力", "慢慢吐出来...把烦恼都呼出去"],
  rational: ["呼气...6 秒", "缓慢呼出..."],
  playful: ["呼——把烦恼都吹走", "呼气...假装在吹生日蜡烛"],
};

export const breathingDone: ToneMessages = {
  warm: ["感觉好点了吗？记得随时回来做深呼吸哦~", "做得很好，希望你感觉轻松了一些"],
  rational: ["呼吸练习完成，建议每隔一段时间做一次", "完成。定期练习有助于长期减压"],
  playful: ["呼吸大师！感觉是不是满血复活了？", "恭喜通关！你的肺给你点了个赞"],
};

// ─── Weather ──────────────────────────────────────────────

export const weatherCold: ToneMessages = {
  warm: ["今天降温了，记得多穿点~别感冒了", "天气变冷了，要好好照顾自己呀"],
  rational: ["今日气温较低，建议增添衣物", "注意保暖，低温环境下要注意防寒"],
  playful: ["冷到发抖！今天穿成粽子也不丢人", "降温了，你的秋裤在呼唤你"],
};

export const weatherRain: ToneMessages = {
  warm: ["今天有雨，出门记得带伞哦~", "下雨天路滑，注意安全呀"],
  rational: ["今日有降雨，建议携带雨具", "出门前请查看天气预报，备好雨伞"],
  playful: ["今天老天要浇水，你记得带伞", "下雨天，打伞的你最帅/最美"],
};

export const weatherHot: ToneMessages = {
  warm: ["今天好热，多喝水防暑！注意防晒哦", "高温天气，要照顾好自己呀"],
  rational: ["今日气温较高，注意防暑降温", "高温天气建议减少户外活动，多补充水分"],
  playful: ["热到融化！今天你是行走的烤肉", "太阳公公今天用力过猛了，注意防晒"],
};

export const weatherSunny: ToneMessages = {
  warm: ["阳光很好，午休出去走走吧~享受好天气", "今天天气真好，心情也跟着好起来了"],
  rational: ["今日天气晴好，适合户外活动", "晴天有助于维生素 D 合成，建议适当晒太阳"],
  playful: ["阳光灿烂！不出去浪一下可惜了", "今天适合在太阳底下晒晒你那颗发霉的心"],
};

// ─── Helper ───────────────────────────────────────────────

/** Get a random message from a tone category */
export function getToneMessage(messages: ToneMessages, tone: CareTone): string {
  const pool = messages[tone] || messages.warm;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Get the AI system prompt modifier for a given tone */
export function getTonePromptModifier(tone: CareTone): string {
  switch (tone) {
    case "warm":
      return "请用温暖、亲切、带有撒娇感的语气，像朋友一样关心用户。可以用'~'、'呀'、'啦'等语气词。";
    case "rational":
      return "请用理性、专业、沉稳的语气，像一个靠谱的伙伴。给出实际建议，不用过多语气词。";
    case "playful":
      return "请用幽默、可爱、带点小调皮的语气，让用户会心一笑。可以用夸张的比喻和有趣的表达。";
  }
}
