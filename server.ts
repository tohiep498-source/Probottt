import express from "express";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";
import moment from "moment-timezone";
import TelegramBot from "node-telegram-bot-api";

// --- TYPES & INTERFACES ---
export interface GameState {
  phien: number;
  secondsLeft: number;
  gamePhase: "BETTING" | "LOCKED" | "ROLLING" | "REVEALING";
  totalBetT: number;
  totalBetX: number;
  totalBetC: number;
  totalBetL: number;
  totalBetTC: number;
  totalBetTL: number;
  totalBetXC: number;
  totalBetXL: number;
  totalBetMM: number;
  userBetsTX: { [userId: string]: { betType: string; amount: number } };
  userBetsCL: { [userId: string]: { betType: string; amount: number } };
  userBetsXien: { [userId: string]: { betType: string; amount: number } };
  userBetsDice: { [userId: string]: { betType: string; amount: number }[] };
  userBetsSum: { [userId: string]: { betType: string; amount: number }[] };
  userBetsMM: { [userId: string]: { betType: string; amount: number }[] };
  betsLog: any[];
  chatLocked: boolean;
  isProcessing: boolean;
  canReceiveCommand: boolean;
  phienAnnounced: boolean;
  isExtension: boolean;
  forceNextPotExplosion: boolean;
  autoPotRate: number;
  lessBetWinsRate: number;
}

export interface User {
  id: string;
  name: string;
  sd?: number;
  money?: number;
  cuoc?: number;
  thang?: number;
  thua?: number;
  nap?: number;
  rut?: number;
  dkrut?: number;
  hh?: number;
  lastBetResetDate?: string;
  lastBetWeekId?: string;
  cuocHomNay?: number;
  cuocTuanNay?: number;
  vongCuoc?: number;
  currentWinStreak?: number;
  currentLossStreak?: number;
  bestWinStreakToday?: number;
  bestLossStreakToday?: number;
  lastStreakPhien?: number;
  lastStreakResetDate?: string;
  betHistory?: any[];
  depositHistory?: any[];
  withdrawHistory?: any[];
  activeBetGame?: "ROOM_DEFAULT" | "TELEGRAM_XX";
  vipPoints?: number;
  vipPointCooldown?: number;
  referrerId?: string;
  // Event check-in (YYYY-MM-DD, timezone Asia/Ho_Chi_Minh)
  eventCheckinLastDate?: string;
  eventCheckinStreak?: number;
  adminGiftWithdrawQuota?: number;
}

export interface GiftCode {
  gift: string;
  value: number;
  creatorId: string;
  createTime: string;
  useTime: string | null;
  userIdUsed: string | null;
  maxUses?: number;
  usedCount?: number;
  usedBy?: string[];
  allowWithdrawWithoutDeposit?: boolean;
  withdrawCap?: number;
}

export interface SoloRoom {
  code: string;
  amount: number;
  ownerId: string;
  ownerName: string;
  ownerChatId: string;
  challengerId: string | null;
  challengerName: string | null;
  challengerChatId: string | null;
  ownerRoll: number[] | null;
  challengerRoll: number[] | null;
  ownerTotal: number | null;
  challengerTotal: number | null;
  winnerId: string | null;
  loserId: string | null;
  payout: number | null;
  status: "OPEN" | "ROLLING" | "FINISHED" | "CANCELLED";
  createdAt: number;
  joinedAt: number | null;
  settledAt: number | null;
  rollDeadlineAt?: number | null;
  pinnedMessageId?: number | null;
  resultReason?: string | null;
}

// --- STATE & DATA MANAGEMENT ---
export const userJsonFile = "user.json";
export const giftJsonFile = "gift.json";
export const banJsonFile = "ban.json";
export const vatphamJsonFile = "vatpham.json";
export const thongkeJsonFile = "thongke.json";
export const phienJsFile = "phien.js";
export const soloRoomsJsonFile = "solo_rooms.json";
export const hourlyGiftStateJsonFile = "hourly_gift_state.json";

export const adminn = process.env.ADMIN_GROUP || "-1003933306407";
export const groupt = process.env.GAME_GROUP || "-1003928586317";
export const gameRoomLink = process.env.GAME_ROOM_LINK || "https://t.me/dragonnroom";

export const SESSION_LIMIT = 10000000;
export const CANCUA_LIMIT = 5000000;
export const DAILY_STREAK_MIN = 4;
export const DAILY_STREAK_PRIZES = [20000, 10000, 5000];
export const SOLO_MIN_BET = 2000;
export const SOLO_PAYOUT_RATE = 1.9;
export const SOLO_ROLL_TIMEOUT_MS = 5 * 60 * 1000;
export const TELEGRAM_XX_MIN_BET = 2000;
export const TELEGRAM_XX_MAX_BET = 199000;
export const TELEGRAM_XX_PAYOUT_RATE = 1.88;
export const HOURLY_ROOM_GIFTCODE_VALUE = 1111;
export const EVENT_KEYWORD = "Dragon.Room";
export const EVENT_DAILY_MIN_DEPOSIT = 30000;
export const EVENT_STREAK_TARGET_DAYS = 7;
export const EVENT_REWARD_GIFTCODE_VALUE = 20000;
export const welcomeStartImagePath = process.env.WELCOME_START_IMAGE_PATH || path.resolve(process.cwd(), "welcome-start.jpg");

export const adminId: number[] = [8691091149, 5563292459, 5846170183];
if (process.env.ADMIN_ID) {
  process.env.ADMIN_ID.split(",").forEach((id) => {
    const num = parseInt(id.trim(), 10);
    if (!isNaN(num) && !adminId.includes(num)) adminId.push(num);
  });
}

export const isAdminUser = (userId?: number) => !!userId && adminId.includes(userId);
export const isNoviceUnlocked = (user: any) => (user?.nap || 0) >= 20000;
export const isAdminGroupChat = (chatId?: string | number) => chatId !== undefined && String(chatId) === String(adminn);
export const isGameRoomChat = (chatId?: string | number) => chatId !== undefined && String(chatId) === String(groupt);

export function resetUserDailyStreaks(user: any, resetDate = moment().tz("Asia/Ho_Chi_Minh").format("YYYY/MM/DD")) {
  user.currentWinStreak = 0;
  user.currentLossStreak = 0;
  user.bestWinStreakToday = 0;
  user.bestLossStreakToday = 0;
  user.lastStreakPhien = 0;
  user.lastStreakResetDate = resetDate;
}

export function getLatestCompletedPhien(): number {
  if (state.gamePhase === "REVEALING") return state.phien;
  return Math.max(0, state.phien - 1);
}

export function getUserActiveStreakCounts(user: any, latestCompletedPhien = getLatestCompletedPhien()) {
  const isContinuous = Number(user?.lastStreakPhien || 0) === Number(latestCompletedPhien || 0);
  return {
    win: isContinuous ? Number(user?.currentWinStreak || 0) : 0,
    loss: isContinuous ? Number(user?.currentLossStreak || 0) : 0,
  };
}

export function getUserQualifiedStreak(user: any, targetDay: string, latestCompletedPhien = getLatestCompletedPhien()) {
  if (!user || user.lastStreakResetDate !== targetDay) return null;
  const { win, loss } = getUserActiveStreakCounts(user, latestCompletedPhien);
  if (win < DAILY_STREAK_MIN && loss < DAILY_STREAK_MIN) return null;
  if (win >= loss) {
    return { type: "win", count: win, label: "Dây thắng" };
  }
  return { type: "loss", count: loss, label: "Dây thua" };
}

export function getUserStreakStatusText(user: any, latestCompletedPhien = getLatestCompletedPhien()): string {
  const { win, loss } = getUserActiveStreakCounts(user, latestCompletedPhien);
  if (win >= DAILY_STREAK_MIN) return `Dây thắng ${win} phiên`;
  if (loss >= DAILY_STREAK_MIN) return `Dây thua ${loss} phiên`;
  if (win > 0) return `Đang thắng ${win} phiên (từ ${DAILY_STREAK_MIN} phiên mới tính BXH)`;
  if (loss > 0) return `Đang thua ${loss} phiên (từ ${DAILY_STREAK_MIN} phiên mới tính BXH)`;
  return `Chưa có dây hợp lệ`;
}

export function buildDailyStreakLeaderboard(users: any[], targetDay: string, latestCompletedPhien = getLatestCompletedPhien()) {
  return users
    .map((user: any) => {
      const streak = getUserQualifiedStreak(user, targetDay, latestCompletedPhien);
      if (!streak) return null;
      return { user, streak };
    })
    .filter(Boolean)
    .sort((a: any, b: any) =>
      (b.streak.count - a.streak.count) ||
      ((b.user.cuocHomNay || 0) - (a.user.cuocHomNay || 0)) ||
      ((b.user.cuoc || 0) - (a.user.cuoc || 0))
    );
}

export function formatRoomBotMessage(text: string): string {
  const content = String(text || "").trim();
  if (!content) return `<b>Thông báo trống</b>`;
  if (content.startsWith("<b>") && content.endsWith("</b>")) return content;
  return `<b>${content}</b>`;
}

export function formatDailyStreakTopRoomMessage(users: any[], type: "win" | "loss", requesterId?: string | number) {
  const todayStr = moment().tz("Asia/Ho_Chi_Minh").format("YYYY/MM/DD");
  const latestCompletedPhien = getLatestCompletedPhien();
  const fullLeaderboard = buildDailyStreakLeaderboard(users, todayStr, latestCompletedPhien)
    .filter((entry: any) => entry?.streak?.type === type);
  const filtered = fullLeaderboard.slice(0, 3);

  const title = type === "win" ? "TOP DÂY THẮNG HÔM NAY" : "TOP DÂY THUA HÔM NAY";
  const label = type === "win" ? "Dây thắng" : "Dây thua";
  const requesterRank = requesterId !== undefined
    ? fullLeaderboard.findIndex((entry: any) => String(entry?.user?.id || "") === String(requesterId))
    : -1;

  if (filtered.length === 0) {
    return `🏆 ${title}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nChưa có người chơi nào vào TOP 1-2-3 ${label.toLowerCase()} từ ${DAILY_STREAK_MIN} phiên liên tiếp.\n📍 Bạn hiện chưa có hạng trong BXH này.`;
  }

  let response = `🏆 ${title}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  filtered.forEach((entry: any, idx: number) => {
    const u = entry.user || {};
    const streak = entry.streak || {};
    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
    const name = u.name || `User****${String(u.id || "").slice(-4)}`;
    response += `${medal} TOP ${idx + 1}: ${name} | ${label}: ${streak.count || 0} phiên\n`;
  });
  if (requesterRank >= 0) {
    const requesterEntry = fullLeaderboard[requesterRank];
    response += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📍 Bạn đang đứng TOP ${requesterRank + 1} | ${label}: ${requesterEntry?.streak?.count || 0} phiên`;
  } else {
    response += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📍 Bạn hiện chưa có hạng trong BXH này`;
  }
  return response.trim();
}

export function generateAutoRewardGiftCode(existingCodes: Set<string>, topIndex: number): string {
  let code = "";
  do {
    code = `TOP${topIndex}${generateRandomSuffix()}`;
  } while (existingCodes.has(code));
  existingCodes.add(code);
  return code;
}

export function updateUserStreakAfterRound(user: any, settledPhien: number, net: number) {
  const todayStr = moment().tz("Asia/Ho_Chi_Minh").format("YYYY/MM/DD");
  if (user.lastStreakResetDate !== todayStr) {
    resetUserDailyStreaks(user, todayStr);
  }

  user.currentWinStreak = Number(user.currentWinStreak || 0);
  user.currentLossStreak = Number(user.currentLossStreak || 0);
  user.bestWinStreakToday = Number(user.bestWinStreakToday || 0);
  user.bestLossStreakToday = Number(user.bestLossStreakToday || 0);

  if (Number(user.lastStreakPhien || 0) !== settledPhien - 1) {
    user.currentWinStreak = 0;
    user.currentLossStreak = 0;
  }

  if (net > 0) {
    user.currentWinStreak += 1;
    user.currentLossStreak = 0;
    user.bestWinStreakToday = Math.max(user.bestWinStreakToday, user.currentWinStreak);
  } else if (net < 0) {
    user.currentLossStreak += 1;
    user.currentWinStreak = 0;
    user.bestLossStreakToday = Math.max(user.bestLossStreakToday, user.currentLossStreak);
  } else {
    user.currentWinStreak = 0;
    user.currentLossStreak = 0;
  }

  user.lastStreakPhien = settledPhien;
  user.lastStreakResetDate = todayStr;
}

export function formatUserCheckMessage(u: any): string {
  const isUnlocked = isNoviceUnlocked(u);
  const vipInfo = getVipTierInfo(u);
  const redeemablePoints = getVipRedeemablePoints(u);
  const balance = Math.floor(u.sd !== undefined ? u.sd : (u.money || 0));
  return `👤 <b>USER CHECK:</b>\n` +
    `🆔 ID: <code>${u.id}</code>\n` +
    `👤 Tên: <b>${u.name || "N/A"}</b>\n` +
    `💵 Số dư: <b>${balance.toLocaleString("vi-VN")} xu</b>\n` +
    `👑 VIP: <b>${getVipLevel(u)} ${vipInfo.badge} (${vipInfo.name})</b>\n` +
    `🚀 Điểm VIP: <b>${vipInfo.points.toLocaleString("vi-VN")}/${vipInfo.nextThresholdPoints.toLocaleString("vi-VN")}</b>\n` +
    `🖐️ Điểm VIP có thể đổi: <b>${redeemablePoints.toLocaleString("vi-VN")}</b>\n` +
    `🎯 Doanh số cược: <b>${(u.cuoc || 0).toLocaleString("vi-VN")} xu</b>\n` +
    `📥 Tổng nạp: <b>${(u.nap || 0).toLocaleString("vi-VN")} xu</b>\n` +
    `📤 Tổng rút: <b>${(u.rut || 0).toLocaleString("vi-VN")} xu</b>\n` +
    `🔄 Vòng cược còn lại: <b>${Math.ceil(u.vongCuoc || 0).toLocaleString("vi-VN")} xu</b>\n` +
    `🔥 Dây hiện tại: <b>${getUserStreakStatusText(u)}</b>\n` +
    `🔰 Tân Thủ: <b>${isUnlocked ? "Đã mở khóa ✅" : `Chưa mở khóa ❌ (${(u.nap || 0).toLocaleString("vi-VN")}/20.000 xu)`}</b>`;
}

export let waitingCai = { value: false };
export let currentCai: { value: { id: string; name: string; amount: number; pool: number; time: number } | null } = { value: null };
export let caiTimeout: { value: NodeJS.Timeout | null } = { value: null };

export const state: GameState = {
  phien: 1000,
  secondsLeft: 60,
  gamePhase: "BETTING",
  totalBetT: 0,
  totalBetX: 0,
  totalBetC: 0,
  totalBetL: 0,
  totalBetTC: 0,
  totalBetTL: 0,
  totalBetXC: 0,
  totalBetXL: 0,
  totalBetMM: 0,
  userBetsTX: {},
  userBetsCL: {},
  userBetsXien: {},
  userBetsDice: {},
  userBetsSum: {},
  userBetsMM: {},
  betsLog: [],
  chatLocked: false,
  isProcessing: false,
  canReceiveCommand: true,
  phienAnnounced: false,
  isExtension: false,
  forceNextPotExplosion: false,
  autoPotRate: 0,
  lessBetWinsRate: 80,
};

export const readJson = (file: string, def = "[]") => {
  if (!fs.existsSync(file)) fs.writeFileSync(file, def, "utf8");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return JSON.parse(def);
  }
};

export const writeJson = (file: string, obj: any) => {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
};

/**
 * Adds deposit to a user with specific logic:
 * - If user cumulative deposit (nap) is < 20,000, then their prior balance (sd, money)
 *   is wiped to 0 BEFORE adding the new deposit amount.
 * - Adds the new deposit (amount) to their balance (sd, money).
 * - Increases u.nap by amount.
 * - Increases u.vongCuoc by amount (x1 wagering).
 */
export function addDepositToUser(user: any, amount: number): { baseResetOccurred: boolean, newlyUnlocked: boolean, totalNapBefore: number, totalNapAfter: number } {
  const totalNapBefore = user.nap || 0;
  const isAlreadyUnlocked = totalNapBefore >= 20000;
  let baseResetOccurred = false;

  if (!isAlreadyUnlocked) {
    user.sd = 0;
    if (user.money !== undefined) user.money = 0;
    baseResetOccurred = true;
  }

  user.sd = (user.sd || 0) + amount;
  if (user.money !== undefined) user.money = (user.money || 0) + amount;
  user.nap = (user.nap || 0) + amount;
  user.vongCuoc = (user.vongCuoc || 0) + amount;

  const totalNapAfter = user.nap;
  const newlyUnlocked = !isAlreadyUnlocked && (totalNapAfter >= 20000);

  return {
    baseResetOccurred,
    newlyUnlocked,
    totalNapBefore,
    totalNapAfter
  };
}

export function createManualDepositRequest(user: any, userId: string | number, amount: number) {
  const now = moment().tz("Asia/Ho_Chi_Minh");
  const time = now.format("YYYY-MM-DD HH:mm:ss");
  const requestId = `${moment().tz("Asia/Ho_Chi_Minh").format("HHmmss")}${Math.floor(100 + Math.random() * 900)}`;
  const content = `MUA ${userId}`;

  if (!user.depositHistory) user.depositHistory = [];
  user.depositHistory.unshift({
    time,
    createdAt: time,
    amount: amount.toLocaleString("vi-VN"),
    status: "Chờ chuyển khoản",
    transferContent: content,
    expiresAt: moment().tz("Asia/Ho_Chi_Minh").add(10, "minutes").format("YYYY-MM-DD HH:mm:ss"),
    requestId,
    adminNotified: false
  });

  return { time, content, requestId };
}

export const DEPOSIT_ORDER_COOLDOWN_SECONDS = 150;

export function getDepositOrderCooldownRemainingSeconds(user: any) {
  const latestDepositOrder = Array.isArray(user?.depositHistory) && user.depositHistory.length > 0
    ? user.depositHistory[0]
    : null;

  if (!latestDepositOrder) return 0;
  if (!latestDepositOrder.requestId) return 0;

  const currentStatus = String(latestDepositOrder.status || "").trim();
  const isPendingDepositOrder = currentStatus === "Chờ chuyển khoản" || currentStatus === "Chờ kiểm tra";
  if (!isPendingDepositOrder) return 0;

  const createdAtText = latestDepositOrder.createdAt
    || latestDepositOrder.time
    || (latestDepositOrder.expiresAt
      ? moment.tz(latestDepositOrder.expiresAt, "Asia/Ho_Chi_Minh").subtract(10, "minutes").format("YYYY-MM-DD HH:mm:ss")
      : "");

  if (!createdAtText) return 0;

  const createdAt = moment.tz(createdAtText, "YYYY-MM-DD HH:mm:ss", "Asia/Ho_Chi_Minh");
  if (!createdAt.isValid()) return 0;

  const elapsedSeconds = moment().tz("Asia/Ho_Chi_Minh").diff(createdAt, "seconds");
  return Math.max(0, DEPOSIT_ORDER_COOLDOWN_SECONDS - elapsedSeconds);
}

// Thông tin nhận chuyển khoản (nạp tiền)
export const DEPOSIT_BANK_CODE = "VCB";
export const DEPOSIT_BANK_NAME = "Vietcombank";
export const DEPOSIT_ACCOUNT_NO = "1060936014";
export const DEPOSIT_ACCOUNT_NAME = "TO KHANH HIEP";

export function buildDepositQrImageUrl(amount: number, content: string) {
  const accountName = encodeURIComponent(DEPOSIT_ACCOUNT_NAME);
  const addInfo = encodeURIComponent(content);
  return `https://img.vietqr.io/image/${DEPOSIT_BANK_CODE}-${DEPOSIT_ACCOUNT_NO}-qr_only.png?amount=${amount}&addInfo=${addInfo}&accountName=${accountName}`;
}

export function formatDepositOrderCaption(amount: number, content: string) {
  return `📌 <b>Lệnh nạp ${amount.toLocaleString("vi-VN")} đã tạo.</b>\n\n🏦 <b>Ngân hàng:</b> ${DEPOSIT_BANK_NAME}\n💳 <b>Số TK:</b> <code>${DEPOSIT_ACCOUNT_NO}</code>\n👤 <b>Chủ TK:</b> <b>${DEPOSIT_ACCOUNT_NAME}</b>\n💰 <b>Số tiền:</b> <b>${amount.toLocaleString("vi-VN")}</b>\n📝 <b>Nội dung:</b> <code>${content}</code>\n⏳ <b>Hiệu lực:</b> ~10 phút <i>(Sau khi chuyển khoản xong, bấm nút "Đã Chuyển Khoản" bên dưới để gửi đơn nạp về admin.)</i>`;
}

export function normalizeMoneyNumber(input: any): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === "number") return Math.floor(input);
  const s = String(input).replace(/[^\d]/g, "");
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

export function getVNDateKey(date = moment().tz("Asia/Ho_Chi_Minh")): string {
  return date.format("YYYY-MM-DD");
}

export function isSuccessfulDepositStatus(status: any): boolean {
  const s = String(status || "").toLowerCase();
  return s.includes("thành công");
}

export function getDepositItemDateKey(item: any): string {
  const raw = item?.time || item?.createdAt || item?.useTime || item?.createTime || "";
  if (typeof raw === "string" && raw.length >= 10) return raw.slice(0, 10);
  const m = moment.tz(String(raw), "Asia/Ho_Chi_Minh");
  return m.isValid() ? m.format("YYYY-MM-DD") : "";
}

export function getUserSuccessfulDepositTotalOnDate(user: any, dateKey: string): number {
  const history = Array.isArray(user?.depositHistory) ? user.depositHistory : [];
  let total = 0;
  for (const item of history) {
    if (!isSuccessfulDepositStatus(item?.status)) continue;
    if (getDepositItemDateKey(item) !== dateKey) continue;
    total += normalizeMoneyNumber(item?.amount);
  }
  return total;
}

export function hasUserSuccessfulDepositInLastDays(user: any, days: number): boolean {
  const history = Array.isArray(user?.depositHistory) ? user.depositHistory : [];
  const since = moment().tz("Asia/Ho_Chi_Minh").startOf("day").subtract(Math.max(0, days - 1), "days");
  for (const item of history) {
    if (!isSuccessfulDepositStatus(item?.status)) continue;
    const key = getDepositItemDateKey(item);
    if (!key) continue;
    const m = moment.tz(key, "YYYY-MM-DD", "Asia/Ho_Chi_Minh");
    if (m.isValid() && m.isSameOrAfter(since, "day")) return true;
  }
  return false;
}

export function isTelegramNameQualified(from: any, keyword = EVENT_KEYWORD): boolean {
  const kw = String(keyword).toLowerCase();
  const fullName = `${from?.first_name || ""} ${from?.last_name || ""}`.trim().toLowerCase();
  const username = String(from?.username || "").toLowerCase();
  return fullName.includes(kw) || username.includes(kw);
}

export function createGiftcodeData(code: string, value: number, creatorId: string, maxUses = 1, createTime = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD HH:mm:ss")): GiftCode {
  return {
    gift: String(code).trim().toUpperCase(),
    value,
    creatorId,
    createTime,
    useTime: null,
    userIdUsed: null,
    maxUses: Math.max(1, Math.floor(Number(maxUses) || 1)),
    usedCount: 0,
    usedBy: [],
  };
}

export function createGiftcodeRecord(value: number, creatorId: string, maxUses = 1) {
  const list = readJson(giftJsonFile);
  const existing = new Set<string>(list.map((g: any) => String(g.gift).toUpperCase()));
  const code = generateUniqueGiftCode(existing);
  const record = createGiftcodeData(code, value, creatorId, maxUses);
  writeJson(giftJsonFile, [...list, record]);
  return code;
}

export function initJsonFiles() {
  readJson(userJsonFile, "[]");
  readJson(giftJsonFile, "[]");
  readJson(banJsonFile, "[]");
  readJson(vatphamJsonFile, "[]");
  readJson(thongkeJsonFile, "[]");
  readJson(soloRoomsJsonFile, "[]");
  readJson(hourlyGiftStateJsonFile, "{}");
  readJson("cau.json", "[]");
  readJson("chanle.json", "[]");
  readJson("hu.json", '{"pot": 10000, "history": []}');
  
  if (!fs.existsSync(phienJsFile)) {
    fs.writeFileSync(phienJsFile, "1000", "utf8");
  } else {
    const saved = parseInt(fs.readFileSync(phienJsFile, "utf8"), 10);
    if (!isNaN(saved)) state.phien = saved;
  }

  const hu = readJson("hu.json", '{"pot": 10000, "history": []}');
  hu.pot = 10000;
  writeJson("hu.json", hu);
  if (typeof hu.autoPotRate === "number") state.autoPotRate = hu.autoPotRate;
  if (typeof hu.lessBetWinsRate === "number") state.lessBetWinsRate = hu.lessBetWinsRate;

  const lbFile = "leaderboard_state.json";
  if (!fs.existsSync(lbFile)) {
    writeJson(lbFile, {
      lastResetDay: moment().tz("Asia/Ho_Chi_Minh").format("YYYY/MM/DD"),
      lastResetWeek: moment().tz("Asia/Ho_Chi_Minh").format("YYYY-W"),
    });
  }
}

export function savePhien() {
  fs.writeFileSync(phienJsFile, String(state.phien), "utf8");
}

// --- TELEGRAM BOT CONFIGURATION ---
export const tokenBot1 = process.env.BOT_TOKEN_1 || "8925099337:AAG9Qnfmn16qOaGzd_zifUPtSQIFedMJxuY";
export const tokenBot2 = process.env.BOT_TOKEN_2 || "8791648429:AAEnvaEE5SN35np7q_iMC9uTfC7sEuJu8-M";
export const tokenBot3 = process.env.BOT_TOKEN_3 || "8814013514:AAHLziGV5TcIwZUYiPhIxaNc6SygaQiIvq0";
export const tokenBot4 = process.env.BOT_TOKEN_4 || "8575655957:AAEJVpRzOYMDQFDm5gwma83a3OKx9NI2UbY";
export const tokenBot5 = process.env.BOT_TOKEN_5 || "8385475918:AAGDXUOGVOQqRidBsdQdKQWSa3rdAhR-8BI";

export function isTokenValid(token: string) {
  return token && token.trim() !== "" && token.includes(":");
}

const pollDisabled = process.env.DISABLE_TELEGRAM_POLLING === "true";
const botOptions = { polling: !pollDisabled };

export const bot1 = isTokenValid(tokenBot1) ? new TelegramBot(tokenBot1, botOptions) : new TelegramBot("123:dummy1", { polling: false });
export const bot2 = isTokenValid(tokenBot2) ? new TelegramBot(tokenBot2, botOptions) : new TelegramBot("123:dummy2", { polling: false });
export const bot3 = isTokenValid(tokenBot3) ? new TelegramBot(tokenBot3, botOptions) : new TelegramBot("123:dummy3", { polling: false });
export const bot4 = isTokenValid(tokenBot4) ? new TelegramBot(tokenBot4, botOptions) : new TelegramBot("123:dummy4", { polling: false });
export const bot5 = isTokenValid(tokenBot5) ? new TelegramBot(tokenBot5, botOptions) : new TelegramBot("123:dummy5", { polling: false });

export const bots = [bot1, bot2, bot3, bot4, bot5];
export const botUsernames = ["Dragon_1gon_bot", "Dragon_2gon_bot", "Dragon_3gon_bot", "Dragon_4gon_bot", "Dragon_5gon_bot"];
export const botErrors: (string | null)[] = [null, null, null, null, null];

bots.forEach((bot, idx) => {
  bot.on("polling_error", (err) => {
    botErrors[idx] = err.message || "Unknown Error";
  });
  
  const originSendMessage = bot.sendMessage;
  bot.sendMessage = function(chatId: string | number, text: string, options: any = {}) {
    const finalOpts = { ...options };
    let finalText = text;
    if (String(chatId) === String(groupt)) {
      finalText = formatRoomBotMessage(String(text || ""));
      finalOpts.parse_mode = "HTML";
      if (!finalOpts.reply_markup) {
        finalOpts.reply_markup = { remove_keyboard: true };
      }
    }
    return originSendMessage.call(this, chatId, finalText, finalOpts);
  };
});

bots.forEach((bot) => {
  const b = bot as any;
  if (b.options?.polling && typeof b.deleteWebHook === "function") {
    b.deleteWebHook().catch(() => {});
  }
});

if (isTokenValid(tokenBot1)) bot1.getMe().then(me => { botUsernames[0] = me.username || botUsernames[0]; }).catch(e => botErrors[0] = e.message);
if (isTokenValid(tokenBot2)) bot2.getMe().then(me => { botUsernames[1] = me.username || botUsernames[1]; }).catch(e => botErrors[1] = e.message);
if (isTokenValid(tokenBot3)) bot3.getMe().then(me => { botUsernames[2] = me.username || botUsernames[2]; }).catch(e => botErrors[2] = e.message);
if (isTokenValid(tokenBot4)) bot4.getMe().then(me => { botUsernames[3] = me.username || botUsernames[3]; }).catch(e => botErrors[3] = e.message);
if (isTokenValid(tokenBot5)) bot5.getMe().then(me => { botUsernames[4] = me.username || botUsernames[4]; }).catch(e => botErrors[4] = e.message);

export function sendMessageToRoom(text: string, options = {}) {
  const list = [bot3, bot1, bot2, bot5, bot4];
  const trySend = (idx: number) => {
    if (idx >= list.length) return;
    list[idx].sendMessage(groupt, text, options).catch(() => trySend(idx + 1));
  };
  trySend(0);
}

export function sendResilientReply(chatId: string | number, text: string, options = {}) {
  const list = [bot3, bot1, bot2, bot5, bot4];
  const trySend = (idx: number) => {
    if (idx >= list.length) return;
    list[idx].sendMessage(chatId, text, options).catch(() => trySend(idx + 1));
  };
  trySend(0);
}

export function sendSoloReply(chatId: string | number, text: string, options = {}) {
  return bot1.sendMessage(chatId, text, options).catch(() => null);
}

export function sendSoloRoomAnnouncement(text: string, options = {}) {
  return bot1.sendMessage(groupt, text, options).catch(() => null);
}

export function sendMessageToAdminGroup(text: string, options = {}) {
  const list = [bot1, bot2, bot3, bot5, bot4];
  const trySend = (idx: number) => {
    if (idx >= list.length) return;
    list[idx].sendMessage(adminn, text, options).catch(() => trySend(idx + 1));
  };
  trySend(0);
}

export function getMainMenuReplyMarkup() {
  return {
    keyboard: [
      [{ text: "📚 Danh Sách Game" }, { text: "👤 Ví Cá Nhân" }],
      [{ text: "🔥 Nổ Hũ Rồng" }],
      [{ text: "🎖 Đua Tôp" }, { text: "👑 Víp" }],
      [{ text: "🏮 Đại Lý Hoa Hồng" }, { text: "🎪 EVENT" }],
    ],
    resize_keyboard: true,
  };
}

export function getWelcomeStartCaption(chatId: string | number): string {
  return `✨ <b>Chào mừng trở lại sòng cược Dragon Room!</b> ✨\n\n🆔 <b>ID của bạn là:</b> <code>${chatId}</code>\n💬 <b>Link dẫn vào phòng cược:</b> ${gameRoomLink}`;
}

export function sendWelcomeStartMessage(chatId: string | number) {
  const caption = getWelcomeStartCaption(chatId);
  const options = {
    parse_mode: "HTML" as const,
    disable_web_page_preview: true,
    reply_markup: getMainMenuReplyMarkup(),
  };

  if (fs.existsSync(welcomeStartImagePath)) {
    bot1.sendPhoto(chatId, welcomeStartImagePath, {
      caption,
      parse_mode: "HTML",
      reply_markup: getMainMenuReplyMarkup(),
    }).catch(() => {
      bot1.sendMessage(chatId, caption, options).catch(() => null);
    });
    return;
  }

  bot1.sendMessage(chatId, caption, options).catch(() => null);
}

export function sendAndPinToAdminGroup(text: string, onPinned?: (id: number) => void) {
  const list = [bot1, bot2, bot3, bot4, bot5];
  const trySend = (idx: number) => {
    if (idx >= list.length) return;
    const bot = list[idx];
    bot.sendMessage(adminn, text, { parse_mode: "HTML" }).then((msg) => {
      bot.pinChatMessage(adminn, msg.message_id).then(() => {
        if (onPinned) onPinned(msg.message_id);
      }).catch(() => {
        if (onPinned) onPinned(msg.message_id);
      });
    }).catch(() => trySend(idx + 1));
  };
  trySend(0);
}

export function unpinFromAdminGroup(messageId: number) {
  const list = [bot1, bot2, bot3, bot4, bot5];
  const msgIdNum = parseInt(String(messageId), 10);
  if (isNaN(msgIdNum)) return;
  list.forEach((bot) => {
    bot.unpinChatMessage(adminn, { message_id: msgIdNum }).catch(() => {});
    bot.unpinChatMessage(adminn, { messageId: msgIdNum } as any).catch(() => {});
  });
}

export function pinGroupMessageWithResilience(chatId: string, messageId: number) {
  const list = [bot2, bot5, bot1, bot3, bot4];
  const tryPin = (idx: number) => {
    if (idx >= list.length) return;
    list[idx].pinChatMessage(chatId, messageId).catch(() => tryPin(idx + 1));
  };
  tryPin(0);
}

export function sendAndPinToGameRoom(text: string, options: any = {}, onPinned?: (id: number) => void) {
  const finalOpts = { parse_mode: "HTML", ...options };
  const list = [bot1, bot2, bot5, bot3, bot4];
  const trySend = (idx: number) => {
    if (idx >= list.length) return;
    list[idx].sendMessage(groupt, text, finalOpts).then((msg) => {
      pinGroupMessageWithResilience(groupt, msg.message_id);
      if (onPinned) onPinned(msg.message_id);
    }).catch(() => trySend(idx + 1));
  };
  trySend(0);
}

export function unpinFromGameRoom(messageId: number) {
  const msgIdNum = parseInt(String(messageId), 10);
  if (isNaN(msgIdNum)) return;
  [bot1, bot2, bot3, bot4, bot5].forEach((bot) => {
    bot.unpinChatMessage(groupt, { message_id: msgIdNum }).catch(() => {});
    bot.unpinChatMessage(groupt, { messageId: msgIdNum } as any).catch(() => {});
  });
}

export function removePinnedSoloRoomMessage(messageId: number) {
  const msgIdNum = parseInt(String(messageId), 10);
  if (isNaN(msgIdNum)) return;
  unpinFromGameRoom(msgIdNum);
  [bot1, bot2, bot3, bot4, bot5].forEach((bot) => {
    bot.deleteMessage(groupt, String(msgIdNum)).catch(() => {});
  });
}

export function clearSoloRoomPin(room?: SoloRoom | null) {
  const msgIdNum = parseInt(String(room?.pinnedMessageId || ""), 10);
  if (isNaN(msgIdNum)) return;
  removePinnedSoloRoomMessage(msgIdNum);
  room!.pinnedMessageId = null;
}

export function lockGroupChat() {
  state.chatLocked = true;
  bot5.setChatPermissions(groupt, {
    can_send_messages: false,
    can_send_media_messages: false,
    can_send_polls: false,
    can_send_other_messages: false,
    can_add_web_page_previews: false,
  } as any).catch(() => {});
}

export function unlockGroupChat() {
  state.chatLocked = false;
  bot5.setChatPermissions(groupt, {
    can_send_messages: true,
    can_send_media_messages: true,
    can_send_polls: true,
    can_send_other_messages: true,
    can_add_web_page_previews: true,
  } as any).catch(() => {});
}

// --- UTILITIES ---
export function parseBetText(inputText: string): { category: string; type: string; amountStr: string } | null {
  const raw = inputText.trim().toLowerCase();
  const words = raw.split(/\s+/);
  if (words.length < 2) return null;

  // MM [1-9] [tiền]
  if (words[0] === "mm" && words.length >= 3) {
    if (/^[1-9]$/.test(words[1])) {
      return { category: "MM", type: `mm${words[1]}`, amountStr: words[2] };
    }
    return null;
  }

  const dict: { [key: string]: { cat: string; type: string } } = {
    t: { cat: "TX", type: "t" }, tai: { cat: "TX", type: "t" },
    x: { cat: "TX", type: "x" }, xiu: { cat: "TX", type: "x" },
    c: { cat: "CL", type: "c" }, chan: { cat: "CL", type: "c" },
    l: { cat: "CL", type: "l" }, le: { cat: "CL", type: "l" },
    tt: { cat: "TX", type: "t" }, xx: { cat: "TX", type: "x" },
    cc: { cat: "CL", type: "c" }, ll: { cat: "CL", type: "l" },
    tc: { cat: "XIÊN", type: "tc" }, tl: { cat: "XIÊN", type: "tl" },
    xc: { cat: "XIÊN", type: "xc" }, xl: { cat: "XIÊN", type: "xl" },
    xxc: { cat: "DICE", type: "xxc" }, xxl: { cat: "DICE", type: "xxl" },
    xxx: { cat: "DICE", type: "xxx" }, xxt: { cat: "DICE", type: "xxt" },
  };

  const choice = dict[words[0]];
  if (choice) {
    return { category: choice.cat, type: choice.type, amountStr: words[1] };
  }

  if (/^d[1-6]{1,2}$/.test(words[0])) {
    return { category: "DICE", type: words[0], amountStr: words[1] };
  }

  if (/^sb(1[0-8]|[1-9])$/.test(words[0])) {
    return { category: "SUM", type: words[0], amountStr: words[1] };
  }

  if (words[0] === "sb" && words.length >= 3) {
    if (/^(1[0-8]|[1-9])$/.test(words[1])) {
      return { category: "SUM", type: "sb" + words[1], amountStr: words[2] };
    }
  }

  return null;
}

export const VIP_TIERS = [
  { level: 0, badge: "▫️", name: "Tân Binh", thresholdPoints: 0, exchangeRate: 0 },
  { level: 1, badge: "🥉", name: "Đồng", thresholdPoints: 100, exchangeRate: 100 },
  { level: 2, badge: "🥈", name: "Bạc", thresholdPoints: 250, exchangeRate: 200 },
  { level: 3, badge: "🎖", name: "Bạch Kim", thresholdPoints: 350, exchangeRate: 300 },
  { level: 4, badge: "👑", name: "Hoàng Kim", thresholdPoints: 450, exchangeRate: 400 },
  { level: 5, badge: "💎", name: "Kim Cương", thresholdPoints: 550, exchangeRate: 500 },
  { level: 6, badge: "⚜️", name: "Tinh Anh", thresholdPoints: 650, exchangeRate: 600 },
  { level: 7, badge: "🛡️", name: "Cao Thủ", thresholdPoints: 750, exchangeRate: 700 },
  { level: 8, badge: "🏅", name: "Đại Cao Thủ", thresholdPoints: 850, exchangeRate: 800 },
  { level: 9, badge: "🔥", name: "Vương Giả", thresholdPoints: 950, exchangeRate: 900 },
  { level: 10, badge: "🌟", name: "Thiên Vương", thresholdPoints: 1050, exchangeRate: 1000 },
  { level: 11, badge: "🪽", name: "Bá Vương", thresholdPoints: 1150, exchangeRate: 1100 },
  { level: 12, badge: "🐉", name: "Thần Long", thresholdPoints: 1250, exchangeRate: 1200 },
  { level: 13, badge: "👑🐉", name: "Chí Tôn", thresholdPoints: 1350, exchangeRate: 1300 },
];

export function getVipPoints(user: any): number {
  return Math.max(0, Number(user?.vipPoints || 0));
}

export function getVipRedeemablePoints(user: any): number {
  return getVipPoints(user);
}

export function getVipTierInfo(user: any) {
  const points = getVipPoints(user);
  let tier = VIP_TIERS[0];
  for (const item of VIP_TIERS) {
    if (points >= item.thresholdPoints) tier = item;
  }
  const nextTier = VIP_TIERS.find((item) => item.level === tier.level + 1) || null;
  return {
    ...tier,
    points,
    nextTier,
    nextThresholdPoints: nextTier?.thresholdPoints || tier.thresholdPoints,
  };
}

export function getVipLevel(user: any): string {
  return `VIP${getVipTierInfo(user).level}`;
}

export function isTelegramXXBetType(type: string): boolean {
  return ["xxc", "xxl", "xxx", "xxt"].includes(String(type || "").toLowerCase());
}

export function getUserActiveBetGame(user: any): "ROOM_DEFAULT" | "TELEGRAM_XX" {
  return user?.activeBetGame === "TELEGRAM_XX" ? "TELEGRAM_XX" : "ROOM_DEFAULT";
}

export function getTelegramXXLabel(type: string): string {
  const map: { [key: string]: string } = {
    xxc: "XXC",
    xxl: "XXL",
    xxx: "XXX",
    xxt: "XXT",
  };
  return map[String(type || "").toLowerCase()] || String(type || "").toUpperCase();
}

export function isTelegramXXWin(type: string, diceValue: number): boolean {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "xxc") return [2, 4, 6].includes(diceValue);
  if (normalized === "xxl") return [1, 3, 5].includes(diceValue);
  if (normalized === "xxx") return [1, 2, 3].includes(diceValue);
  if (normalized === "xxt") return [4, 5, 6].includes(diceValue);
  return false;
}

export function getVipBadge(user: any): string {
  const info = getVipTierInfo(user);
  return info.level > 0 ? info.badge : "";
}

export function getVipRoomBadgePrefix(user: any): string {
  const info = getVipTierInfo(user);
  if (info.level <= 0) return "";
  return `${info.badge}VIP${info.level} `;
}

export function toBoldDigits(value: string | number): string {
  const digitMap: Record<string, string> = {
    "0": "𝟬",
    "1": "𝟭",
    "2": "𝟮",
    "3": "𝟯",
    "4": "𝟰",
    "5": "𝟱",
    "6": "𝟲",
    "7": "𝟳",
    "8": "𝟴",
    "9": "𝟵",
  };
  return String(value ?? "").replace(/\d/g, (digit) => digitMap[digit] || digit);
}

export function getVipExchangeRate(user: any): number {
  return Math.max(0, Number(getVipTierInfo(user)?.exchangeRate || 0));
}

export function formatVipGuideMessage(user: any): string {
  const info = getVipTierInfo(user);
  const nextLevelText = info.nextTier
    ? `${info.points.toLocaleString("vi-VN")}/${info.nextThresholdPoints.toLocaleString("vi-VN")} up VIP ${info.nextTier.level}`
    : `${info.points.toLocaleString("vi-VN")} điểm | Đã đạt VIP tối đa`;
  const redeemablePoints = getVipRedeemablePoints(user);
  const currentRate = getVipExchangeRate(user);
  const rateLines = VIP_TIERS
    .filter((item) => item.level > 0)
    .map((item) => `${item.badge} <b>VIP ${item.level}</b> (${item.name}): <b>${item.exchangeRate.toLocaleString("vi-VN")}đ</b>/1 điểm VIP`)
    .join("\n");

  return `👑 <b>VÍP</b> 👑\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👑 Cấp Vip hiện tại: <b>${info.level}</b> ${info.badge} (<b>${info.name}</b>)\n` +
    `🚀 Điểm VIP: <b>${nextLevelText}</b>\n` +
    `🖐️ Số điểm VIP có thể đổi: <b>${redeemablePoints.toLocaleString("vi-VN")}</b>\n` +
    `💸 Tỷ lệ quy đổi hiện tại: <b>${currentRate.toLocaleString("vi-VN")}đ</b>/1 điểm VIP\n` +
    `🎯 Tổng doanh số cược: <b>${Number(user?.cuoc || 0).toLocaleString("vi-VN")} xu</b>\n\n` +
    `📖 <b>BẢNG HƯỚNG DẪN ĐỔI ĐIỂM VIP:</b>\n` +
    `${rateLines}\n\n` +
    `🧾 <b>Cú pháp đổi điểm:</b> <code>/doidiemvip [số điểm]</code>\n` +
    `💡 <i>Cược từ 50.000 xu trở lên mới tính. Mỗi lệnh hợp lệ được cộng 1 điểm VIP, nhưng phải cách nhau 3 lệnh hợp lệ mới được cộng tiếp.</i>`;
}

export function applyVipPointFromBet(user: any, betValue: number): boolean {
  user.vipPoints = Math.max(0, Number(user.vipPoints || 0));
  user.vipPointCooldown = Math.max(0, Number(user.vipPointCooldown || 0));
  if (Number(betValue || 0) < 50000) return false;

  if (user.vipPointCooldown > 0) {
    user.vipPointCooldown -= 1;
    return false;
  }

  user.vipPoints += 1;
  user.vipPointCooldown = 3;
  return true;
}

export function checkAndResetUserBets(user: any) {
  const nowVN = moment().tz("Asia/Ho_Chi_Minh");
  const todayStr = nowVN.format("YYYY/MM/DD");
  const weekId = nowVN.format("YYYY-W");
  if (user.lastBetResetDate !== todayStr) {
    user.cuocHomNay = 0;
    user.lastBetResetDate = todayStr;
    resetUserDailyStreaks(user, todayStr);
  }
  if (user.lastBetWeekId !== weekId) {
    user.cuocTuanNay = 0;
    user.lastBetWeekId = weekId;
  }
}

export function isBanned(userId: string | number): boolean {
  const banned = readJson(banJsonFile);
  return banned.some((u: any) => String(u.id) === String(userId));
}

export function generateGiftCode(): string {
  let res = "";
  for (let i = 8; i > 0; i--) res += Math.floor(Math.random() * 10);
  return res;
}

export function generateUniqueGiftCode(existingCodes: Set<string>): string {
  let code = "";
  do {
    code = generateGiftCode();
  } while (existingCodes.has(code));
  existingCodes.add(code);
  return code;
}


export function generateUniqueAdminGiftCode(existingCodes: Set<string>): string {
  let code = "";
  do {
    code = `MY${generateRandomSuffix()}`;
  } while (existingCodes.has(code));
  existingCodes.add(code);
  return code;
}

export function generateRandomSuffix(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let res = "";
  for (let i = 0; i < 6; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
  return res;
}

export function formatMaskedId(userId: any): string {
  const str = String(userId);
  return str.length > 5 ? '****' + str.slice(-5) : '****' + str;
}

export function getUserBalance(user: any): number {
  return Math.floor(user?.sd !== undefined ? user.sd : (user?.money || 0));
}

export function setUserBalance(user: any, balance: number) {
  user.sd = Math.floor(balance);
  if (user.money !== undefined) user.money = Math.floor(balance);
}

export function readSoloRooms(): SoloRoom[] {
  return readJson(soloRoomsJsonFile, "[]");
}

export function writeSoloRooms(rooms: SoloRoom[]) {
  const normalized = rooms.slice(-200);
  writeJson(soloRoomsJsonFile, normalized);
}

export function generateSoloRoomCode(existingCodes: Set<string>): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  } while (existingCodes.has(code));
  return code;
}

export function getOpenSoloRooms(rooms: SoloRoom[] = readSoloRooms()): SoloRoom[] {
  return rooms
    .filter((room) => room.status === "OPEN" && !room.challengerId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function formatSoloOpenRooms(rooms: SoloRoom[] = readSoloRooms()): string {
  const openRooms = getOpenSoloRooms(rooms);
  if (openRooms.length === 0) {
    return `(Chưa có phòng mở. Gõ <code>solo [số tiền]</code> để tạo phòng.)`;
  }

  return openRooms.slice(0, 20).map((room, idx) =>
    `${idx + 1}. <b>${room.code}</b> | Chủ phòng: <b>${room.ownerName}</b> | Cược: <b>${room.amount.toLocaleString("vi-VN")} xu</b>`
  ).join("\n");
}

export function formatSoloLobbyMessage(rooms: SoloRoom[] = readSoloRooms()): string {
  return `🎲 <b>GAME SOLO XÚC XẮC</b> 🎲\n` +
    `Tạo phòng và mời bạn bè tham gia đấu xúc xắc. Mỗi người tung <b>1 viên xúc xắc 3D Telegram</b>. Người có kết quả cao hơn sẽ thắng.\n\n` +
    `👉 Số tiền chơi tối thiểu là <b>${SOLO_MIN_BET.toLocaleString("vi-VN")}</b> (không giới hạn tối đa theo cấu hình game, chỉ cần đủ số dư).\n` +
    `- Tỉ lệ trả thưởng <b>${SOLO_PAYOUT_RATE.toFixed(2)}</b>\n\n` +
    `Cách chơi:\n` +
    `<code>solo [Số tiền]</code> để tạo phòng chơi\n` +
    `<code>/solo [Mã phòng]</code> để vào phòng chơi\n` +
    `<code>/xx [Mã phòng]</code> hoặc bấm nút <b>Tung XX</b> để tung xúc xắc\n` +
    `<code>/huy [Mã phòng]</code> để huỷ phòng (Chỉ huỷ khi chưa có ai vào, chỉ được huỷ sau 1 phút tạo phòng)\n\n` +
    `Danh sách các phòng SOLO hiện tại:\n` +
    `${formatSoloOpenRooms(rooms)}`;
}

export function formatRoomDefaultGuideMessage(): string {
  return `💬 <b>TÀI XỈU SĂN HŨ</b> 💬\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Đây là khu <b>đặt cược phòng</b> mặc định trong Dragon Room.\n\n` +
    `📖 <b>CÁC LỆNH ĐẶT CƯỢC:</b>\n\n` +
    `🔹 <b>1. TÀI XỈU (TX)</b>\n` +
    `• <code>t [số_xu]</code> hoặc <code>tai [số_xu]</code>\n` +
    `• <code>x [số_xu]</code> hoặc <code>xiu [số_xu]</code>\n` +
    `<i>Ví dụ: <code>tai 10000</code> hoặc <code>x 50000</code></i>\n\n` +
    `🔸 <b>2. CHẴN LẺ (CL)</b>\n` +
    `• <code>c [số_xu]</code> hoặc <code>chan [số_xu]</code>\n` +
    `• <code>l [số_xu]</code> hoặc <code>le [số_xu]</code>\n` +
    `<i>Ví dụ: <code>chan 20000</code> hoặc <code>l 30000</code></i>\n\n` +
    `🔹 <b>3. XIÊN</b>\n` +
    `• <code>tc [số_xu]</code> (Tài Chẵn)\n` +
    `• <code>tl [số_xu]</code> (Tài Lẻ)\n` +
    `• <code>xc [số_xu]</code> (Xỉu Chẵn)\n` +
    `• <code>xl [số_xu]</code> (Xỉu Lẻ)\n\n` +
    `🔹 <b>4. CƯỢC XÚC XẮC CŨ (DICE)</b>\n` +
    `• <code>d[số] [số_xu]</code> (Mặt số từ 1-6)\n` +
    `<i>Ví dụ: <code>d6 10000</code>, <code>d55 20000</code></i>\n\n` +
    `🔹 <b>5. CƯỢC TỔNG ĐIỂM (SUM)</b>\n` +
    `• <code>sb[tổng] [số_xu]</code> (Tổng điểm từ 3-18)\n` +
    `<i>Ví dụ: <code>sb11 50000</code></i>\n\n` +
    `🕵️ <b>6. CƯỢC ẨN DANH</b>\n` +
    `• Dùng: <code>tt</code>, <code>xx</code>, <code>cc</code>, <code>ll</code>\n` +
    `<i>Ví dụ: <code>tt 20000</code> cược ẩn danh Tài</i>\n\n` +
    `💡 <i>Mẹo: Có thể gõ <code>tai max</code> hoặc <code>chan max</code> để cược toàn bộ số dư hợp lệ.</i>`;
}

export function buildSoloRoomDeepLink(roomCode: string): string {
  return `https://t.me/${botUsernames[0]}?start=solo_${roomCode}`;
}

export function buildReferralDeepLink(userId: string): string {
  return `https://t.me/${botUsernames[0]}?start=ref_${userId}`;
}

export function awardReferralCommission(users: User[], loser: User | undefined, lossAmount: number): void {
  if (!loser || !lossAmount || lossAmount <= 0) return;
  const referrerId = String(loser.referrerId || "").trim();
  if (!referrerId || referrerId === String(loser.id)) return;
  const referrer = users.find((u) => String(u.id) === referrerId);
  if (!referrer) return;
  const commission = Math.floor(lossAmount * 0.01);
  if (commission <= 0) return;
  referrer.hh = (referrer.hh || 0) + commission;
}

export function ensureRandomHourlyGiftSchedule(now = moment().tz("Asia/Ho_Chi_Minh")) {
  const state = readJson(hourlyGiftStateJsonFile, "{}");
  const currentHour = now.hour();
  const windowStartHour = currentHour - (currentHour % 2);
  const windowStart = now.clone().startOf("day").add(windowStartHour, "hours");
  const windowEnd = windowStart.clone().add(2, "hours").subtract(1, "millisecond");
  const windowKey = `${windowStart.format("YYYY-MM-DD-HH")}_2H`;
  const currentNextRunAt = Number(state.nextRunAt || 0);
  const isScheduleValid = state.scheduledWindowKey === windowKey && currentNextRunAt >= windowStart.valueOf() && currentNextRunAt <= windowEnd.valueOf();

  if (!isScheduleValid) {
    const minRunAt = Math.min(windowEnd.valueOf(), now.valueOf() + 15000);
    const randomOffset = Math.max(0, windowEnd.valueOf() - minRunAt);
    state.scheduledWindowKey = windowKey;
    state.nextRunAt = minRunAt + Math.floor(Math.random() * (randomOffset + 1));
    writeJson(hourlyGiftStateJsonFile, state);
  }

  return state;
}

export function maybeDispatchRandomHourlyGiftCode() {
  const now = moment().tz("Asia/Ho_Chi_Minh");
  const currentHour = now.hour();
  const windowStartHour = currentHour - (currentHour % 2);
  const windowKey = `${now.clone().startOf("day").add(windowStartHour, "hours").format("YYYY-MM-DD-HH")}_2H`;
  const state = ensureRandomHourlyGiftSchedule(now);
  if (state.lastDispatchWindowKey === windowKey) return;
  if (Date.now() < Number(state.nextRunAt || 0)) return;

  const giftData = readJson(giftJsonFile, "[]");
  const existingCodes = new Set<string>((giftData || []).map((g: any) => String(g.gift || "")));
  const code = generateUniqueGiftCode(existingCodes);

  giftData.push(createGiftcodeData(code, HOURLY_ROOM_GIFTCODE_VALUE, "AUTO_HOURLY_ROOM", 1, now.format("YYYY-MM-DD HH:mm:ss")));
  writeJson(giftJsonFile, giftData);

  state.lastDispatchWindowKey = windowKey;
  state.lastGiftCode = code;
  writeJson(hourlyGiftStateJsonFile, state);

  sendMessageToRoom(
    `✈️ <b>DRAGONROOM PHÁT LỘC NGẪU NHIÊN</b> ✈️\n` +
    `╔════════════════════╗\n` +
    `🎁 <b>Giftcode giờ vàng vừa rơi!</b>\n` +
    `💎 Mệnh giá: <b>${HOURLY_ROOM_GIFTCODE_VALUE.toLocaleString("vi-VN")} xu</b>\n` +
    `🔑 Nhập ngay: /code ${code}\n` +
    `⏰ hệ thống chỉ phát 1 code vào thời gian ngẫu nhiên.\n` +
    `🚀 Canh room để săn code tiếp theo nhé!\n` +
    `╚════════════════════╝`,
    { parse_mode: "HTML" }
  );
}

export function formatSoloPinnedRoomMessage(room: SoloRoom): string {
  return `🎲 <b>GAME SOLO XÚC XẮC</b>\n` +
    `👑 Chủ phòng: <b>${room.ownerName}</b>\n` +
    `🎟 Mã phòng: <code>${room.code}</code>\n` +
    `💰 Mức cược: <b>${room.amount.toLocaleString("vi-VN")} xu</b>\n` +
    `⚔️ Vào bot chính để nhập lệnh <code>/solo ${room.code}</code>`;
}

export function formatTelegramXXGuideMessage(): string {
  return `🎲 <b>XÚC XẮC TELEGRAM</b> 🎲\n\n` +
    `Chế độ mặc định: <b>BOT tung xúc xắc</b>\n\n` +
    `Nội dung | Kết quả 1 xúc xắc | Tỷ lệ ăn\n` +
    `<code>XXC</code> | <b>2,4,6</b> | <b>x${TELEGRAM_XX_PAYOUT_RATE.toFixed(2)}</b>\n` +
    `<code>XXL</code> | <b>1,3,5</b> | <b>x${TELEGRAM_XX_PAYOUT_RATE.toFixed(2)}</b>\n` +
    `<code>XXX</code> | <b>1,2,3</b> | <b>x${TELEGRAM_XX_PAYOUT_RATE.toFixed(2)}</b>\n` +
    `<code>XXT</code> | <b>4,5,6</b> | <b>x${TELEGRAM_XX_PAYOUT_RATE.toFixed(2)}</b>\n\n` +
    `👉 Tối thiểu là <b>${TELEGRAM_XX_MIN_BET.toLocaleString("vi-VN")}</b> và tối đa là <b>${TELEGRAM_XX_MAX_BET.toLocaleString("vi-VN")}</b>\n\n` +
    `🔖 Cách chơi: <code>[Nội dung] [tiền cược]</code>\n` +
    `VD: <code>XXC 10000</code> hoặc <code>XXL 10000</code>`;
}

export function formatGameCatalogMessage(rooms: SoloRoom[] = readSoloRooms()): string {
  return `📚 <b>DANH SÁCH GAME</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🎲 1. <b>TÀI XỈU SĂN HŨ</b>\n` +
    `🎲 2. <b>GAME SOLO XÚC XẮC</b>\n` +
    `🎲 3. <b>XÚC XẮC TELEGRAM</b>`;
}

export function getGameCatalogReplyMarkup() {
  return {
    inline_keyboard: [
      [{ text: "🎲 1 - Tài Xỉu Săn Hũ", callback_data: "game_catalog_room_default" }],
      [{ text: "🎲 2 - Game Solo Xúc Xắc", callback_data: "game_catalog_solo" }],
      [{ text: "🎲 3 - Xúc Xắc Telegram", callback_data: "game_catalog_telegram" }],
      [{ text: "💬 Vào Phòng Dragon Room", url: gameRoomLink }]
    ]
  };
}

export function getDuaTopReplyMarkup() {
  return {
    inline_keyboard: [
      [{ text: "🏆 BXH PHONG THẦN", callback_data: "duatop_phong_than" }],
      [{ text: "🔥 BXH ĐU DÂY", callback_data: "duatop_du_day" }]
    ]
  };
}

export function getSoloRollReplyMarkup(roomCode: string) {
  return {
    inline_keyboard: [[{ text: "🎲 Tung XX", callback_data: `solo_roll_${roomCode}` }]]
  };
}

export function formatSoloRollPrompt(room: SoloRoom, targetUserId: string): string {
  const isOwner = String(room.ownerId) === String(targetUserId);
  const myRole = isOwner ? "Chủ phòng" : "Đối thủ";
  const enemyName = isOwner ? (room.challengerName || "Đối thủ") : room.ownerName;
  const myRolled = isOwner ? !!room.ownerRoll : !!room.challengerRoll;
  const enemyRolled = isOwner ? !!room.challengerRoll : !!room.ownerRoll;
  const deadlineText = room.rollDeadlineAt
    ? moment(room.rollDeadlineAt).tz("Asia/Ho_Chi_Minh").format("HH:mm:ss DD/MM")
    : "N/A";

  return `🎲 <b>GAME SOLO XÚC XẮC</b>\n` +
    `🎟 Mã phòng: <code>${room.code}</code>\n` +
    `👤 Vai trò: <b>${myRole}</b>\n` +
    `⚔️ Đối thủ: <b>${enemyName}</b>\n` +
    `💰 Mức cược: <b>${room.amount.toLocaleString("vi-VN")} xu</b>\n` +
    `⏰ Hạn tung XX: <b>${deadlineText}</b>\n` +
    `📌 Trạng thái: Bạn <b>${myRolled ? "đã tung" : "chưa tung"}</b> | Đối thủ <b>${enemyRolled ? "đã tung" : "chưa tung"}</b>\n\n` +
    `${myRolled ? `✅ Bạn đã tung 1 viên XX Telegram rồi, chờ đối thủ.` : `👉 Bấm nút bên dưới hoặc gõ <code>/xx ${room.code}</code> để tung 1 viên xúc xắc 3D Telegram.`}`;
}

export function compareSoloRolls(ownerRoll: number[], challengerRoll: number[]): number {
  const ownerTotal = ownerRoll.reduce((sum, value) => sum + value, 0);
  const challengerTotal = challengerRoll.reduce((sum, value) => sum + value, 0);
  if (ownerTotal !== challengerTotal) return ownerTotal - challengerTotal;

  const ownerSorted = [...ownerRoll].sort((a, b) => b - a);
  const challengerSorted = [...challengerRoll].sort((a, b) => b - a);
  for (let i = 0; i < ownerSorted.length; i++) {
    if (ownerSorted[i] !== challengerSorted[i]) return ownerSorted[i] - challengerSorted[i];
  }
  return 0;
}

export async function sendSoloTelegramDice(chatId: string | number): Promise<number | null> {
  try {
    const msg = await bot1.sendDice(chatId);
    return msg?.dice?.value || null;
  } catch {
    return null;
  }
}

export function formatSoloRoomAnnouncement(room: SoloRoom, users: any[]): string {
  const winner = users.find((u: any) => String(u.id) === String(room.winnerId || ""));
  const loser = users.find((u: any) => String(u.id) === String(room.loserId || ""));

  if (!winner || !loser) {
    return `🎲 <b>GAME SOLO XÚC XẮC</b>\n🎟 Mã phòng: <code>${room.code}</code>\n⚠️ Kèo này chưa thể chốt người thắng thua.`;
  }

  const winnerRollText = String(room.winnerId) === String(room.ownerId)
    ? (room.ownerTotal !== null ? String(room.ownerTotal) : "Chưa tung")
    : (room.challengerTotal !== null ? String(room.challengerTotal) : "Chưa tung");
  const loserRollText = String(room.loserId) === String(room.ownerId)
    ? (room.ownerTotal !== null ? String(room.ownerTotal) : "Chưa tung")
    : (room.challengerTotal !== null ? String(room.challengerTotal) : "Chưa tung");

  return `🎲 <b>GAME SOLO XÚC XẮC</b>\n` +
    `🎟 Mã phòng: <code>${room.code}</code>\n` +
    `💰 Mức cược: <b>${room.amount.toLocaleString("vi-VN")} xu</b>\n\n` +
    `🏆 Người chiến thắng: <b>${winner.name || "Người chơi"}</b>\n` +
    `🆔 ID: <code>${winner.id}</code>\n` +
    `🎲 Tung ra: <b>${winnerRollText}</b>\n` +
    `💸 Ăn được: <b>${(room.payout || 0).toLocaleString("vi-VN")} xu</b>\n\n` +
    `😭 Người thua: <b>${loser.name || "Người chơi"}</b>\n` +
    `🆔 ID: <code>${loser.id}</code>\n` +
    `🎲 Tung ra: <b>${loserRollText}</b>\n` +
    `📌 Kết luận: <b>Còn Cái Nịt</b>`;
}

export function finalizeSoloRoom(room: SoloRoom, users: any[], reason = "") {
  const owner = users.find((u: any) => String(u.id) === String(room.ownerId));
  const challenger = users.find((u: any) => String(u.id) === String(room.challengerId || ""));
  if (!owner || !challenger) {
    room.status = "CANCELLED";
    room.settledAt = Date.now();
    room.resultReason = "Không đủ người chơi hợp lệ để kết toán.";
    return null;
  }

  let winner: any = null;
  let loser: any = null;
  let payout = 0;
  let resultReason = reason;

  if (!room.ownerRoll && !room.challengerRoll) {
    setUserBalance(owner, getUserBalance(owner) + room.amount);
    setUserBalance(challenger, getUserBalance(challenger) + room.amount);
    room.status = "CANCELLED";
    room.settledAt = Date.now();
    room.resultReason = reason || "Hết 5 phút nhưng cả 2 bên đều chưa tung xúc xắc, hệ thống hoàn tiền.";
    room.payout = 0;
    return {
      mode: "refund",
      message: `🎲 <b>GAME SOLO XÚC XẮC</b>\n🎟 Mã phòng: <code>${room.code}</code>\n⚠️ ${room.resultReason}`,
      roomAnnouncement: `🎲 <b>GAME SOLO XÚC XẮC</b>\n🎟 Mã phòng: <code>${room.code}</code>\n⚠️ ${room.resultReason}`
    };
  }

  if (room.ownerRoll && !room.challengerRoll) {
    winner = owner;
    loser = challenger;
    resultReason = reason || `Đối thủ không tung xúc xắc trong 5 phút nên thua.`;
  } else if (!room.ownerRoll && room.challengerRoll) {
    winner = challenger;
    loser = owner;
    resultReason = reason || `Chủ phòng không tung xúc xắc trong 5 phút nên thua.`;
  } else {
    const diff = compareSoloRolls(room.ownerRoll!, room.challengerRoll!);
    if (diff === 0) {
      setUserBalance(owner, getUserBalance(owner) + room.amount);
      setUserBalance(challenger, getUserBalance(challenger) + room.amount);
      room.status = "CANCELLED";
      room.settledAt = Date.now();
      room.resultReason = "Hai bên hòa tuyệt đối, hệ thống hoàn tiền.";
      room.payout = 0;
      return {
        mode: "refund",
        message: `🎲 <b>GAME SOLO XÚC XẮC</b>\n🎟 Mã phòng: <code>${room.code}</code>\n👑 ${room.ownerName}: <b>${room.ownerRoll!.join(" - ")}</b> (Tổng <b>${room.ownerTotal}</b>)\n⚔️ ${room.challengerName}: <b>${room.challengerRoll!.join(" - ")}</b> (Tổng <b>${room.challengerTotal}</b>)\n⚠️ ${room.resultReason}`,
        roomAnnouncement: `🎲 <b>GAME SOLO XÚC XẮC</b>\n🎟 Mã phòng: <code>${room.code}</code>\n⚠️ Hai bên hòa kèo, hoàn tiền.`
      };
    }
    winner = diff > 0 ? owner : challenger;
    loser = diff > 0 ? challenger : owner;
    resultReason = reason || "Cả hai đã tung xúc xắc, hệ thống chốt kết quả.";
  }

  payout = Math.floor(room.amount * SOLO_PAYOUT_RATE);
  setUserBalance(winner, getUserBalance(winner) + payout);
  winner.thang = (winner.thang || 0) + payout;
  loser.thua = (loser.thua || 0) + room.amount;
  awardReferralCommission(users, loser, room.amount);

  room.winnerId = String(winner.id);
  room.loserId = String(loser.id);
  room.payout = payout;
  room.status = "FINISHED";
  room.settledAt = Date.now();
  room.resultReason = resultReason;

  return {
    mode: "win",
    message: `🎲 <b>GAME SOLO XÚC XẮC</b>\n` +
      `🎟 Mã phòng: <code>${room.code}</code>\n` +
      `💰 Mức cược mỗi bên: <b>${room.amount.toLocaleString("vi-VN")} xu</b>\n` +
      `👑 Chủ phòng <b>${room.ownerName}</b>: <b>${room.ownerRoll ? room.ownerRoll.join(" - ") : "Chưa tung"}</b>${room.ownerTotal !== null ? ` (Tổng <b>${room.ownerTotal}</b>)` : ""}\n` +
      `⚔️ Đối thủ <b>${room.challengerName}</b>: <b>${room.challengerRoll ? room.challengerRoll.join(" - ") : "Chưa tung"}</b>${room.challengerTotal !== null ? ` (Tổng <b>${room.challengerTotal}</b>)` : ""}\n\n` +
      `🏆 Người thắng: <b>${winner.name || `User****${String(winner.id).slice(-4)}`}</b>\n` +
      `💸 Trả thưởng: <b>${payout.toLocaleString("vi-VN")} xu</b> (${SOLO_PAYOUT_RATE.toFixed(2)})\n` +
      `📌 Kết luận: ${resultReason}`,
    roomAnnouncement: formatSoloRoomAnnouncement(room, users)
  };
}

export function processSoloRoomTimeouts() {
  const rooms = readSoloRooms();
  const users = readJson(userJsonFile);
  let changed = false;

  rooms.forEach((room) => {
    if (room.status !== "ROLLING" || !room.rollDeadlineAt || Date.now() < room.rollDeadlineAt) return;
    const result = finalizeSoloRoom(room, users, "Hết 5 phút, bên chưa tung xúc xắc bị xử thua.");
    clearSoloRoomPin(room);
    if (result) {
      if (room.ownerChatId) sendSoloReply(room.ownerChatId, result.message, { parse_mode: "HTML" });
      if (room.challengerChatId && String(room.challengerChatId) !== String(room.ownerChatId)) {
        sendSoloReply(room.challengerChatId, result.message, { parse_mode: "HTML" });
      }
      if ((result as any).roomAnnouncement) sendSoloRoomAnnouncement((result as any).roomAnnouncement, { parse_mode: "HTML" });
    }
    changed = true;
  });

  if (changed) {
    writeJson(userJsonFile, users);
    writeSoloRooms(rooms);
  }
}

export async function handleSoloRollAction(roomCode: string, actorId: string, replyChatId: string | number) {
  const soloRooms = readSoloRooms();
  const users = readJson(userJsonFile);
  const room = soloRooms.find((item) => item.code === roomCode);

  if (!room || room.status !== "ROLLING") {
    return { ok: false, callbackText: "Phòng SOLO không còn hợp lệ.", showAlert: true };
  }

  if (![String(room.ownerId), String(room.challengerId || "")].includes(String(actorId))) {
    return { ok: false, callbackText: "Bạn không thuộc phòng SOLO này.", showAlert: true };
  }

  if (room.rollDeadlineAt && Date.now() > room.rollDeadlineAt) {
    processSoloRoomTimeouts();
    return { ok: false, callbackText: "Đã hết thời gian tung xúc xắc.", showAlert: true };
  }

  const isOwner = String(room.ownerId) === String(actorId);
  if ((isOwner && room.ownerRoll) || (!isOwner && room.challengerRoll)) {
    return { ok: false, callbackText: "Bạn đã tung rồi.", showAlert: false };
  }

  const diceValue = await sendSoloTelegramDice(replyChatId);
  if (!diceValue) {
    return { ok: false, callbackText: "Không tung được xúc xắc 3D Telegram, thử lại sau.", showAlert: true };
  }

  if (isOwner) {
    room.ownerRoll = [diceValue];
    room.ownerTotal = diceValue;
  } else {
    room.challengerRoll = [diceValue];
    room.challengerTotal = diceValue;
  }

  let replyMsg = `🎲 <b>GAME SOLO XÚC XẮC</b>\n🎟 Mã phòng: <code>${room.code}</code>\n✅ Bạn đã tung 1 viên XX Telegram: <b>${diceValue}</b>`;
  if (room.ownerRoll && room.challengerRoll) {
    const result = finalizeSoloRoom(room, users);
    writeJson(userJsonFile, users);
    writeSoloRooms(soloRooms);
    if (result) {
      sendSoloReply(room.ownerChatId, result.message, { parse_mode: "HTML" });
      if (room.challengerChatId && String(room.challengerChatId) !== String(room.ownerChatId)) {
        sendSoloReply(room.challengerChatId, result.message, { parse_mode: "HTML" });
      }
      if ((result as any).roomAnnouncement) sendSoloRoomAnnouncement((result as any).roomAnnouncement, { parse_mode: "HTML" });
    }
    return { ok: true, callbackText: `Bạn đã tung ${diceValue}` };
  }

  writeSoloRooms(soloRooms);
  replyMsg += `\n⏳ Đang chờ đối thủ tung xúc xắc.`;
  sendSoloReply(replyChatId, replyMsg, { parse_mode: "HTML" });
  return { ok: true, callbackText: `Bạn đã tung ${diceValue}` };
}

export function rollSoloDiceSet(): number[] {
  return [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1
  ];
}

export function rollSoloBattleResult() {
  let ownerRoll = rollSoloDiceSet();
  let challengerRoll = rollSoloDiceSet();
  let ownerTotal = ownerRoll.reduce((sum, value) => sum + value, 0);
  let challengerTotal = challengerRoll.reduce((sum, value) => sum + value, 0);
  let guard = 0;

  while (ownerTotal === challengerTotal && guard < 50) {
    ownerRoll = rollSoloDiceSet();
    challengerRoll = rollSoloDiceSet();
    ownerTotal = ownerRoll.reduce((sum, value) => sum + value, 0);
    challengerTotal = challengerRoll.reduce((sum, value) => sum + value, 0);
    guard += 1;
  }

  return { ownerRoll, challengerRoll, ownerTotal, challengerTotal };
}

// --- GAME LOGIC ---
export function resetBettingSession() {
  state.totalBetT = state.totalBetX = state.totalBetC = state.totalBetL = state.totalBetTC = state.totalBetTL = state.totalBetXC = state.totalBetXL = state.totalBetMM = 0;
  state.userBetsTX = {};
  state.userBetsCL = {};
  state.userBetsXien = {};
  state.userBetsDice = {};
  state.userBetsSum = {};
  state.userBetsMM = {};
  state.betsLog = [];
  state.isProcessing = false;
  state.phienAnnounced = false;
}

export function checkSpecialRoll(dice: number[]): boolean {
  return dice.every((v) => v === dice[0]) && (dice[0] === 1 || dice[0] === 6);
}

export function distributePotToWinners(potAmount: number, winners: { [key: string]: number }) {
  const winnersArray = Object.entries(winners);
  if (winnersArray.length === 0) return [];
  const totalBetAmount = winnersArray.reduce((acc, cur) => acc + cur[1], 0);
  if (winnersArray.length === 1) {
    return [{ userId: winnersArray[0][0], winAmount: Math.floor(potAmount * 0.7) }];
  }
  return winnersArray.map(([userId, amount]) => ({
    userId,
    winAmount: Math.floor(potAmount * 0.7 * (amount / totalBetAmount)),
  }));
}

export function handlePot(potAmount: number, betters: string[] = [], winners: { [key: string]: number } = {}) {
  const payouts = distributePotToWinners(potAmount, winners);
  let users = readJson(userJsonFile);
  const winnerDetails: any[] = [];

  payouts.forEach(({ userId, winAmount }) => {
    const user = users.find((u: any) => String(u.id) === String(userId));
    if (user) {
      user.sd = (user.sd || 0) + winAmount;
      if (user.money !== undefined) user.money = (user.money || 0) + winAmount;
      winnerDetails.push({ userId, name: user.name || `User****${String(userId).slice(-4)}`, winAmount });
    } else {
      winnerDetails.push({ userId, name: `User****${String(userId).slice(-4)}`, winAmount });
    }
    bot1.sendMessage(userId, `🎉 NỔ HŨ ROOM RỒNG PHIÊN #${state.phien}! Bạn nhận được +${winAmount.toLocaleString("vi-VN")} xu!`).catch(() => {});
  });

  const remainingPot = payouts.length > 0 ? Math.floor(potAmount * 0.3) : potAmount;
  let huData = { pot: remainingPot, history: [] as any[], autoPotRate: state.autoPotRate, lessBetWinsRate: state.lessBetWinsRate };
  
  try {
    const raw = readJson("hu.json");
    huData.history = raw.history || [];
  } catch {}

  huData.pot = remainingPot;
  if (!huData.history) huData.history = [];
  if (payouts.length > 0) {
    huData.history.unshift({
      phien: state.phien,
      time: moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD HH:mm:ss"),
      potAmount,
      winners: winnerDetails,
    });
    if (huData.history.length > 50) huData.history.pop();
  }

  writeJson("hu.json", huData);
  writeJson(userJsonFile, users);

  const listWinnersText = payouts.length > 0
    ? payouts.map((w, i) => `${i + 1}. <b>****${String(w.userId).slice(-4)}</b> | +<b>${w.winAmount.toLocaleString("vi-VN")} xu</b>`).join("\n")
    : `<i>Hũ bảo toàn sang phiên tiếp theo!</i>`;

  const msg = `👑 <b>NỔ HŨ ROOM RỒNG PHIÊN #${state.phien}</b> 👑\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔥 <b>Giá trị nổ hũ:</b> <b>${potAmount.toLocaleString("vi-VN")} xu</b>\n🏆 <b>Người nhận hũ:</b>\n${listWinnersText}\n💎 Bảo lưu ban đầu: <b>${remainingPot.toLocaleString("vi-VN")} xu</b>.\n💬 <a href="${gameRoomLink}">Bấm nhanh vào phòng cược</a>`;

  const potMessageOptions = {
    parse_mode: "HTML" as const,
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[{ text: "💬 Vào phòng cược ngay", url: gameRoomLink }]]
    }
  };

  bot2.sendMessage(groupt, msg, potMessageOptions).then((s) => {
    pinGroupMessageWithResilience(groupt, s.message_id);
  }).catch(() => {});

  betters.forEach((uid) => {
    bot1.sendMessage(uid, msg, potMessageOptions).catch(() => {});
  });
}

export async function sendDice() {
  state.isProcessing = true;
  const diceResults: number[] = [];

  const diffTX = Math.abs(state.totalBetT - state.totalBetX);
  const diffCL = Math.abs(state.totalBetC - state.totalBetL);

  let targetTX: "TÀI" | "XỈU" | null = null;
  let targetCL: "CHẮN" | "LẺ" | null = null;

  if (diffTX > 0 || diffCL > 0) {
    if (diffTX >= diffCL) {
      targetTX = state.totalBetT < state.totalBetX ? "TÀI" : "XỈU";
    } else {
      targetCL = state.totalBetC < state.totalBetL ? "CHẮN" : "LẺ";
    }
  }

  const shouldRig = state.lessBetWinsRate > 0 && Math.random() * 100 < state.lessBetWinsRate;

  try {
    for (let i = 0; i < 3; i++) {
      const msg = await bot5.sendDice(groupt);
      if (msg?.dice) {
        diceResults.push(msg.dice.value);
      } else {
        throw new Error("sendDice failed");
      }
      if (i < 2) await new Promise((resolve) => setTimeout(resolve, 800));
    }
  } catch (err) {
    let matched = false;
    let attempts = 0;
    while (!matched && attempts < 1000) {
      attempts++;
      diceResults.length = 0;
      diceResults.push(
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1
      );
      const sum = diceResults[0] + diceResults[1] + diceResults[2];
      const sumCat = sum > 10 ? "TÀI" : "XỈU";
      const clCat = sum % 2 === 0 ? "CHẮN" : "LẺ";

      let txMatch = !shouldRig || !targetTX || sumCat === targetTX;
      let clMatch = !shouldRig || !targetCL || clCat === targetCL;
      if (txMatch && clMatch) matched = true;
    }
  }

  if (diceResults.length !== 3) {
    diceResults.push(
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 3000));
  // Tung hết viên XX thứ 3 mới mở khoá chat
  if (state.chatLocked) unlockGroupChat();

  const telegramDiceValue = diceResults[0] || (Math.floor(Math.random() * 6) + 1);
  const sumOfResults = diceResults.reduce((a, b) => a + b, 0);
  const sumCat = sumOfResults > 10 ? "TÀI" : "XỈU";
  const clCat = sumOfResults % 2 === 0 ? "CHẮN" : "LẺ";
  const taixiuEmoji = sumCat === "TÀI" ? "🔵" : "🔴";
  const chanleEmoji = clCat === "CHẮN" ? "⚪" : "⚫";
  const quayPrize = Math.floor(Math.random() * 9) + 1;

  let potAmount = 10000;
  try {
    const rawHU = readJson("hu.json");
    potAmount = rawHU.pot || 10000;
  } catch (e) {}

  let users = readJson(userJsonFile);
  let totalWin = 0, totalLoss = 0, potIncrease = 0;
  const playerReports: { [key: string]: any[] } = {};

  const winTXTotal = sumCat === "TÀI" ? state.totalBetT : state.totalBetX;
  const loseTXTotal = sumCat === "TÀI" ? state.totalBetX : state.totalBetT;
  const isTxPotEligible = winTXTotal <= loseTXTotal;

  const winCLTotal = clCat === "CHẮN" ? state.totalBetC : state.totalBetL;
  const loseCLTotal = clCat === "CHẮN" ? state.totalBetL : state.totalBetC;
  const isClPotEligible = winCLTotal <= loseCLTotal;

  const winningXien = sumCat === "TÀI" ? (clCat === "CHẮN" ? "tc" : "tl") : (clCat === "CHẮN" ? "xc" : "xl");
  let betTC = 0, betTL = 0, betXC = 0, betXL = 0;
  Object.entries(state.userBetsXien).forEach(([_, bet]) => {
    if (bet.betType === "tc") betTC += bet.amount;
    if (bet.betType === "tl") betTL += bet.amount;
    if (bet.betType === "xc") betXC += bet.amount;
    if (bet.betType === "xl") betXL += bet.amount;
  });
  const winXienTotal = winningXien === "tc" ? betTC : winningXien === "tl" ? betTL : winningXien === "xc" ? betXC : betXL;
  const totalXienBet = betTC + betTL + betXC + betXL;
  const isXienPotEligible = winXienTotal <= (totalXienBet - winXienTotal);

  // TX Settlements
  Object.entries(state.userBetsTX).forEach(([userId, bet]) => {
    const isWin = (bet.betType === "t" && sumCat === "TÀI") || (bet.betType === "x" && sumCat === "XỈU");
    const usr = users.find((u: any) => String(u.id) === String(userId));
    if (usr) {
      const payout = isWin ? Math.floor(bet.amount * 1.92) : 0;
      if (isWin) {
        usr.sd = (usr.sd || 0) + payout;
        if (usr.money !== undefined) usr.money = (usr.money || 0) + payout;
        usr.thang = (usr.thang || 0) + payout;
        totalWin += payout;
      } else {
        usr.thua = (usr.thua || 0) + bet.amount;
        awardReferralCommission(users, usr, bet.amount);
        if (isTxPotEligible) potIncrease += Math.floor(bet.amount * 0.02 * 0.75);
        totalLoss += bet.amount;
      }
      if (!playerReports[userId]) playerReports[userId] = [];
      playerReports[userId].push({ category: "TX", betType: bet.betType === "t" ? "TÀI" : "XỈU", amount: bet.amount, isWin, payout });
    }
  });

  // CL Settlements
  Object.entries(state.userBetsCL).forEach(([userId, bet]) => {
    const isWin = (bet.betType === "c" && clCat === "CHẮN") || (bet.betType === "l" && clCat === "LẺ");
    const usr = users.find((u: any) => String(u.id) === String(userId));
    if (usr) {
      const payout = isWin ? Math.floor(bet.amount * 1.92) : 0;
      if (isWin) {
        usr.sd = (usr.sd || 0) + payout;
        if (usr.money !== undefined) usr.money = (usr.money || 0) + payout;
        usr.thang = (usr.thang || 0) + payout;
        totalWin += payout;
      } else {
        usr.thua = (usr.thua || 0) + bet.amount;
        awardReferralCommission(users, usr, bet.amount);
        if (isClPotEligible) potIncrease += Math.floor(bet.amount * 0.02 * 0.75);
        totalLoss += bet.amount;
      }
      if (!playerReports[userId]) playerReports[userId] = [];
      playerReports[userId].push({ category: "CL", betType: bet.betType === "c" ? "CHẮN" : "LẺ", amount: bet.amount, isWin, payout });
    }
  });

  // Xien Settlements
  Object.entries(state.userBetsXien).forEach(([userId, bet]) => {
    const isWin = bet.betType === winningXien;
    const usr = users.find((u: any) => String(u.id) === String(userId));
    if (usr) {
      const payout = isWin ? Math.floor(bet.amount * 2.5) : 0;
      if (isWin) {
        usr.sd = (usr.sd || 0) + payout;
        if (usr.money !== undefined) usr.money = (usr.money || 0) + payout;
        usr.thang = (usr.thang || 0) + payout;
        totalWin += payout;
      } else {
        usr.thua = (usr.thua || 0) + bet.amount;
        awardReferralCommission(users, usr, bet.amount);
        if (isXienPotEligible) potIncrease += Math.floor(bet.amount * 0.02 * 0.75);
        totalLoss += bet.amount;
      }
      if (!playerReports[userId]) playerReports[userId] = [];
      playerReports[userId].push({ category: "XIÊN", betType: bet.betType.toUpperCase(), amount: bet.amount, isWin, payout });
    }
  });

  // Dice Settlements
  if (state.userBetsDice) {
    Object.entries(state.userBetsDice).forEach(([userId, bets]) => {
      bets.forEach((bet) => {
        const normalizedType = String(bet.betType || "").toLowerCase();
        const numToMatch = parseInt(normalizedType.replace("d", ""), 10);
        const isWin = isTelegramXXBetType(normalizedType)
          ? isTelegramXXWin(normalizedType, telegramDiceValue)
          : diceResults.includes(numToMatch);
        const usr = users.find((u: any) => String(u.id) === String(userId));
        if (usr) {
          const payout = isWin
            ? Math.floor(bet.amount * (isTelegramXXBetType(normalizedType) ? TELEGRAM_XX_PAYOUT_RATE : 1.93))
            : 0;
          if (isWin) {
            usr.sd = (usr.sd || 0) + payout;
            if (usr.money !== undefined) usr.money = (usr.money || 0) + payout;
            usr.thang = (usr.thang || 0) + payout;
            totalWin += payout;
          } else {
            usr.thua = (usr.thua || 0) + bet.amount;
            awardReferralCommission(users, usr, bet.amount);
            totalLoss += bet.amount;
          }
          if (!playerReports[userId]) playerReports[userId] = [];
          playerReports[userId].push({ category: "DICE", betType: isTelegramXXBetType(normalizedType) ? getTelegramXXLabel(normalizedType) : bet.betType.toUpperCase(), amount: bet.amount, isWin, payout });
        }
      });
    });
  }

  // SB Settlements
  if (state.userBetsSum) {
    Object.entries(state.userBetsSum).forEach(([userId, bets]) => {
      bets.forEach((bet) => {
        const sumToMatch = parseInt(bet.betType.replace("sb", ""), 10);
        const isWin = sumOfResults === sumToMatch;
        const usr = users.find((u: any) => String(u.id) === String(userId));
        if (usr) {
          const payout = isWin ? Math.floor(bet.amount * 2.3) : 0;
          if (isWin) {
            usr.sd = (usr.sd || 0) + payout;
            if (usr.money !== undefined) usr.money = (usr.money || 0) + payout;
            usr.thang = (usr.thang || 0) + payout;
            totalWin += payout;
          } else {
            usr.thua = (usr.thua || 0) + bet.amount;
            awardReferralCommission(users, usr, bet.amount);
            totalLoss += bet.amount;
          }
          if (!playerReports[userId]) playerReports[userId] = [];
          playerReports[userId].push({ category: "SUM", betType: bet.betType.toUpperCase(), amount: bet.amount, isWin, payout });
        }
      });
    });
  }

  // MM Settlements (Vòng quay may mắn 1-9)
  if (state.userBetsMM) {
    Object.entries(state.userBetsMM).forEach(([userId, bets]) => {
      bets.forEach((bet) => {
        const mmNum = parseInt(String(bet.betType || "").toLowerCase().replace("mm", ""), 10);
        if (isNaN(mmNum) || mmNum < 1 || mmNum > 9) return;
        const isWin = mmNum === quayPrize;
        const usr = users.find((u: any) => String(u.id) === String(userId));
        if (usr) {
          const payout = isWin ? Math.floor(bet.amount * 7) : 0;
          if (isWin) {
            usr.sd = (usr.sd || 0) + payout;
            if (usr.money !== undefined) usr.money = (usr.money || 0) + payout;
            usr.thang = (usr.thang || 0) + payout;
            totalWin += payout;
          } else {
            usr.thua = (usr.thua || 0) + bet.amount;
            awardReferralCommission(users, usr, bet.amount);
            totalLoss += bet.amount;
          }
          if (!playerReports[userId]) playerReports[userId] = [];
          playerReports[userId].push({ category: "MM", betType: `MM ${mmNum}`, amount: bet.amount, isWin, payout });
        }
      });
    });
  }

  if (totalWin > totalLoss) potIncrease = 0;
  potAmount = Math.floor(potAmount + potIncrease);

  // Save history
  Object.entries(playerReports).forEach(([uid, bets]) => {
    const usr = users.find((u: any) => String(u.id) === String(uid));
    if (usr) {
      if (!usr.betHistory) usr.betHistory = [];
      let net = 0;
      bets.forEach((b) => net += b.isWin ? (b.payout - b.amount) : -b.amount);
      updateUserStreakAfterRound(usr, state.phien, net);
      usr.betHistory.push({
        phien: state.phien,
        time: moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD HH:mm:ss"),
        dice: diceResults.join("-"),
        total: sumOfResults,
        result: `${sumCat} ${clCat}`,
        bets: bets.map((b: any) => ({ category: b.category, betType: b.betType, amount: b.amount, isWin: b.isWin, payout: b.payout })),
        net,
        streak: {
          currentWin: usr.currentWinStreak || 0,
          currentLoss: usr.currentLossStreak || 0,
          qualified: getUserStreakStatusText(usr, state.phien)
        }
      });
      if (usr.betHistory.length > 20) usr.betHistory.shift();
    }
  });

  // Banker Settle
  if (currentCai.value) {
    const bankerId = String(currentCai.value.id);
    const bankerUser = users.find((u: any) => String(u.id) === bankerId);
    let totalBetsPlaced = 0;
    if (state.userBetsTX) Object.values(state.userBetsTX).forEach((b: any) => totalBetsPlaced += b.amount);
    if (state.userBetsCL) Object.values(state.userBetsCL).forEach((b: any) => totalBetsPlaced += b.amount);
    if (state.userBetsXien) Object.values(state.userBetsXien).forEach((b: any) => totalBetsPlaced += b.amount);
    if (state.userBetsDice) Object.values(state.userBetsDice).forEach((arr: any) => arr.forEach((b: any) => totalBetsPlaced += b.amount));
    if (state.userBetsSum) Object.values(state.userBetsSum).forEach((arr: any) => arr.forEach((b: any) => totalBetsPlaced += b.amount));
    if (state.userBetsMM) Object.values(state.userBetsMM).forEach((arr: any) => arr.forEach((b: any) => totalBetsPlaced += b.amount));

    const netResult = totalBetsPlaced - totalWin;
    let finalPool = currentCai.value.pool + netResult;
    if (finalPool < 0) finalPool = 0;

    if (bankerUser) {
      const originalSd = bankerUser.sd !== undefined ? bankerUser.sd : (bankerUser.money || 0);
      const newSd = Math.floor(originalSd + finalPool);
      bankerUser.sd = newSd;
      if (bankerUser.money !== undefined) bankerUser.money = newSd;

      if (!bankerUser.depositHistory) bankerUser.depositHistory = [];
      bankerUser.depositHistory.unshift({
        time: moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD HH:mm:ss"),
        amount: finalPool.toLocaleString("vi-VN"),
        status: `Kết toán Làm Cái phiên #${state.phien} (${netResult >= 0 ? "+" : ""}${netResult.toLocaleString("vi-VN")} xu)`
      });
    }

    const bankerMsg = `👑 <b>KẾT TOÁN LÀM CÁI PHIÊN #${state.phien}</b>\n🎰 Chủ cái: <b>${currentCai.value.name}</b>\n💵 Tiền làm cái: <b>${currentCai.value.pool.toLocaleString("vi-VN")} xu</b>\n💵 Tổng cược nhận: <b>${totalBetsPlaced.toLocaleString("vi-VN")} xu</b>\n💸 Tổng trả thưởng: <b>${totalWin.toLocaleString("vi-VN")} xu</b>\n📊 Biến động: <b>${netResult >= 0 ? "🟢 +" + netResult.toLocaleString("vi-VN") : "🔴 -" + Math.abs(netResult).toLocaleString("vi-VN")} xu</b>\n🏦 Nhận lại số dư: <b>${finalPool.toLocaleString("vi-VN")} xu</b>`;
    bot1.sendMessage(bankerId, bankerMsg, { parse_mode: "HTML" }).catch(() => {});
    sendMessageToRoom(bankerMsg, { parse_mode: "HTML" });
  }

  writeJson("hu.json", { pot: potAmount });
  writeJson(userJsonFile, users);

  // Send player reports
  Object.entries(playerReports).forEach(([uid, bets]) => {
    const usr = users.find((u: any) => String(u.id) === String(uid));
    if (!usr) return;
    let msg = `🔔 <b>BÁO CÁO CƯỢC PHIÊN #${state.phien}</b>\n🎲 Kq: <b>${diceResults.join(" - ")}</b> (Tổng: <b>${sumOfResults}</b>) 👉 <b>${sumCat}</b> - <b>${clCat}</b>\n🎡 Vòng quay: <b>${quayPrize}</b>\n🎯 XX Telegram: <b>${telegramDiceValue}</b>\n\n🧾 <b>Lệnh đặt:</b>\n`;
    let net = 0;
    bets.forEach((b) => {
      const labelType = typeof b.betType === "function" ? (clCat === "CHẮN" ? "CHẮN" : "LẺ") : b.betType;
      if (b.isWin) {
        msg += `🟢 Thắng: <b>${b.category}</b> (<code>${labelType}</code>) | Cược <b>${b.amount.toLocaleString("vi-VN")}</b> | +<b>${b.payout.toLocaleString("vi-VN")} xu</b>\n`;
        net += b.payout - b.amount;
      } else {
        msg += `🔴 Thua: <b>${b.category}</b> (<code>${labelType}</code>) | Cược -<b>${b.amount.toLocaleString("vi-VN")} xu</b>\n`;
        net -= b.amount;
      }
    });
    msg += `\n📊 Biến động: ${net >= 0 ? "🟢 +" + net.toLocaleString("vi-VN") : "🔴 -" + Math.abs(net).toLocaleString("vi-VN")} xu\n🔥 Dây hiện tại: <b>${getUserStreakStatusText(usr, state.phien)}</b>\n💵 Số dư: <b>${Math.floor(usr.sd || usr.money || 0).toLocaleString("vi-VN")} xu</b>`;
    bot1.sendMessage(uid, msg, { parse_mode: "HTML" }).catch(() => {});
  });

  const cauList = readJson("cau.json");
  cauList.unshift(taixiuEmoji);
  if (cauList.length > 24) cauList.pop();
  writeJson("cau.json", cauList);

  const chanleList = readJson("chanle.json");
  chanleList.unshift(chanleEmoji);
  if (chanleList.length > 24) chanleList.pop();
  writeJson("chanle.json", chanleList);

  const recentTxStats = cauList.slice(0, 12).reverse().join("");
  const recentClStats = chanleList.slice(0, 12).reverse().join("");
  const boldDiceResults = diceResults.map((item) => toBoldDigits(item)).join("  ");
  const boldSumOfResults = toBoldDigits(sumOfResults);
  const boldQuayPrize = toBoldDigits(quayPrize);
  const boldTotalWin = toBoldDigits(totalWin.toLocaleString("vi-VN"));
  const boldTotalLoss = toBoldDigits(totalLoss.toLocaleString("vi-VN"));
  const boldPotIncrease = toBoldDigits(potIncrease.toLocaleString("vi-VN"));
  const boldPotAmount = toBoldDigits(potAmount.toLocaleString("vi-VN"));
  const lobbyMsg = `🎲 <b>Kết quả XX phiên #${state.phien}</b>\n` +
    `<pre>┏━━━━━━━━━━━━┓
┃  ${boldDiceResults}  👉[${boldSumOfResults}] ${sumCat} ${clCat} ${taixiuEmoji}${chanleEmoji}
┃ 🎡 Giải số cược vòng quay: ${boldQuayPrize} (1-9)
┃
┃ Tổng thắng: ${boldTotalWin}
┃ Tổng thua: ${boldTotalLoss}
┃ Cộng hũ  : +${boldPotIncrease}
┃ Hũ hiện tại: ${boldPotAmount}
┗━━━━━━━━━━━━┛</pre>
Thống kê kết quả gần đây:

${recentTxStats}
    
${recentClStats}`;
  // Gửi kết quả phiên trước, rồi mới gửi thông báo "làm cái" để đảm bảo thứ tự hiển thị
  const lobbySent = await bot2.sendMessage(groupt, lobbyMsg, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "💵 Nạp Tiền Ngay", url: `https://t.me/${botUsernames[0]}` },
        { text: "📊 Lịch Sử Phiên", url: "https://t.me/lichsuphiendragon" }
      ]],
    },
  }).catch(() => null);

  const resultToGroup = `🎲 Kết quả phiên ${state.phien} 🎲\n ${diceResults.join("  ")} 👉 ${sumCat} ${clCat} ${taixiuEmoji} ${chanleEmoji}`;
  bot2.sendMessage("-1004298002180", resultToGroup).catch(() => {});

  let triggerPot = false;
  if (state.forceNextPotExplosion) {
    triggerPot = true;
    state.forceNextPotExplosion = false;
  } else if (state.autoPotRate > 0 && Math.random() * 100 < state.autoPotRate) {
    triggerPot = true;
  } else if (checkSpecialRoll(diceResults)) {
    triggerPot = true;
  }

  if (triggerPot) {
    const betters = Array.from(new Set([
      ...Object.keys(state.userBetsTX || {}),
      ...Object.keys(state.userBetsCL || {}),
      ...Object.keys(state.userBetsXien || {}),
      ...Object.keys(state.userBetsDice || {}),
      ...Object.keys(state.userBetsSum || {}),
      ...Object.keys(state.userBetsMM || {}),
    ]));
    const winnersDict: { [key: string]: number } = {};
    for (const uid of betters) {
      const bets = playerReports?.[uid] || [];
      const wins = bets.filter(b => b.isWin === true);
      if (wins.length > 0) {
        winnersDict[uid] = wins.reduce((acc, cur) => acc + (Number(cur.amount) || 0), 0);
      }
    }
    handlePot(potAmount, betters, winnersDict);
  }

  currentCai.value = null;
  waitingCai.value = false;
  if (caiTimeout.value) {
    clearTimeout(caiTimeout.value);
    caiTimeout.value = null;
  }

  // Thông báo vòng quay may mắn: hiển thị sau kết quả, trước phần làm cái
  const mmGuideText =
    `🎡 <b>Vòng quay may mắn</b> (số 1-9): đặt <code>MM [số] [tiền]</code>\n` +
    `VD: <code>MM 5 20000</code>\n` +
    `- Tỉ lệ trả thưởng: <b>x7</b>`;
  if (lobbySent) {
    await bot2.sendMessage(groupt, mmGuideText, { parse_mode: "HTML" }).catch(() => {});
  } else {
    sendMessageToRoom(mmGuideText, { parse_mode: "HTML" });
  }

  const lamCaiText = `⏰ <b>Còn 20s để LÀM CÁI phiên #${state.phien + 1}</b>\n✅ <code>/lamcai [số tiền]</code> (1.000.000 - 5.000.000)`;
  if (lobbySent) {
    await bot2.sendMessage(groupt, lamCaiText, { parse_mode: "HTML" }).catch(() => {});
  } else {
    // Fallback: nếu bot2 lỗi thì vẫn gửi qua hàm gửi phòng (có thể đổi bot)
    sendMessageToRoom(lamCaiText, { parse_mode: "HTML" });
  }

  waitingCai.value = true;
  caiTimeout.value = setTimeout(() => {
    waitingCai.value = false;
    // Sau 20s làm cái mới bắt đầu hiện "xin mời đặt cược" (dù có người làm cái hay không)
    let pot = 10000;
    try { pot = readJson("hu.json").pot || 10000; } catch {}
    state.phienAnnounced = true;
    sendMessageToRoom(`🔔 Phiên cược thứ #${state.phien} bắt đầu!\nHũ rồng vàng: ${pot.toLocaleString("vi-VN")} xu!`, {
      reply_markup: {
        inline_keyboard: [[{ text: "⚡ Nạp Tiền Ngay", url: `https://t.me/${botUsernames[0]}` }]],
      },
    });
    sendMessageToRoom(`📝 Xin mời đặt cược phiên #${state.phien} - Tiền cược tối thiểu 1.000 và tối đa 5.000.000\nCách chơi: [Cửa cược] [số tiền]\n- T/X/C/L\n- D1, D2,... D6\n- SB3 - SB18\n- TC, TL, XC, XL\n- MM (1-9) x7 (VD: <code>MM 5 20000</code>)\nCú pháp cược sảnh kịch tính:\n<code>t 50000</code> hoặc <code>c 100000</code>`, { parse_mode: "HTML" });
  }, 20000);

  state.gamePhase = "REVEALING";
  state.secondsLeft = 12;
}

export function tickGameLoop() {
  try {
    processSoloRoomTimeouts();
    const nowVN = moment().tz("Asia/Ho_Chi_Minh");
    const todayStr = nowVN.format("YYYY/MM/DD");
    const lbStateFile = "leaderboard_state.json";

    if (fs.existsSync(lbStateFile)) {
      let lbState = JSON.parse(fs.readFileSync(lbStateFile, "utf8"));
      if (lbState.lastResetDay && lbState.lastResetDay !== todayStr) {
        const yesterdayStr = lbState.lastResetDay;
        const users = readJson(userJsonFile);
        const latestCompletedPhien = getLatestCompletedPhien();
        const leaderboard = buildDailyStreakLeaderboard(users, yesterdayStr, latestCompletedPhien);
        let sumAnnounce = `🏆 <b>BXH DÂY THẮNG / DÂY THUA HÔM QUA (${yesterdayStr})</b> 🏆\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

        if (leaderboard.length === 0) {
          sumAnnounce += `<i>Chưa có ai đạt dây thắng hoặc dây thua từ ${DAILY_STREAK_MIN} phiên liên tiếp trở lên và không bỏ lỡ phiên nào.</i>`;
        } else {
          leaderboard.slice(0, 10).forEach((entry: any, i: number) => {
            const u = entry.user;
            const streak = entry.streak;
            const prizeTag = i === 0
              ? `🥇 [Giftcode ${DAILY_STREAK_PRIZES[0].toLocaleString("vi-VN")} xu]`
              : i === 1
                ? `🥈 [Giftcode ${DAILY_STREAK_PRIZES[1].toLocaleString("vi-VN")} xu]`
                : i === 2
                  ? `🥉 [Giftcode ${DAILY_STREAK_PRIZES[2].toLocaleString("vi-VN")} xu]`
                  : "🎗️ [Vinh danh]";
            sumAnnounce += `${i + 1}. player <b>${u.name || `User****${String(u.id).slice(-4)}`}</b> | ${streak.label}: <b>${streak.count}</b> phiên\n   👉 ${prizeTag}\n`;
          });
        }

        const topWinners = leaderboard.slice(0, 3);
        const giftData = readJson(giftJsonFile);
        const existingCodes = new Set<string>((giftData || []).map((g: any) => String(g.gift)));
        topWinners.forEach((entry: any, idx: number) => {
          const u = entry.user;
          const streak = entry.streak;
          const prizePower = DAILY_STREAK_PRIZES[idx];
          const code = generateAutoRewardGiftCode(existingCodes, idx + 1);
          giftData.push(createGiftcodeData(code, prizePower, "AUTO_DAILY_STREAK", 1, moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD HH:mm:ss")));
          sendResilientReply(
            u.id,
            `🎉 <b>Thưởng BXH dây ngày ${yesterdayStr}</b>\n🏆 Hạng: <b>TOP ${idx + 1}</b>\n🔥 Thành tích: <b>${streak.label} ${streak.count} phiên</b>\n🎁 Giftcode: <code>/code ${code}</code>\n💎 Mệnh giá: <b>${prizePower.toLocaleString("vi-VN")} xu</b>\n⏰ Hệ thống tự trao lúc 00:00.`,
            { parse_mode: "HTML" }
          );
        });

        writeJson(giftJsonFile, giftData);
        sendMessageToRoom(sumAnnounce, { parse_mode: "HTML" });
        users.forEach((u: any) => {
          u.cuocHomNay = 0;
          u.lastBetResetDate = todayStr;
          resetUserDailyStreaks(u, todayStr);
        });
        writeJson(userJsonFile, users);
        lbState.lastResetDay = todayStr;
        writeJson(lbStateFile, lbState);
      }
    }
  } catch (e) {
    console.error("Leaderboard daily issues:", e);
  }

  if (state.gamePhase === "BETTING") {
    state.secondsLeft -= 1;
    let diceBetSum = 0;
    if (state.userBetsDice) {
      Object.entries(state.userBetsDice).forEach(([uid, list]) => {
        list.forEach(b => diceBetSum += b.amount);
      });
    }

    let sumBetSum = 0;
    if (state.userBetsSum) {
      Object.entries(state.userBetsSum).forEach(([uid, list]) => {
        list.forEach(b => sumBetSum += b.amount);
      });
    }

    let mmBetSum = 0;
    if (state.userBetsMM) {
      Object.entries(state.userBetsMM).forEach(([uid, list]) => {
        list.forEach(b => mmBetSum += b.amount);
      });
    }

    const totalMoneyBetted = state.totalBetT + state.totalBetX + state.totalBetC + state.totalBetL + state.totalBetTC + state.totalBetTL + state.totalBetXC + state.totalBetXL + diceBetSum + sumBetSum + mmBetSum;
    const activeBetsCount = 
      Object.keys(state.userBetsTX || {}).length + 
      Object.keys(state.userBetsCL || {}).length + 
      Object.keys(state.userBetsXien || {}).length +
      Object.keys(state.userBetsDice || {}).length +
      Object.keys(state.userBetsSum || {}).length +
      Object.keys(state.userBetsMM || {}).length;

    if (activeBetsCount > 0 && totalMoneyBetted > 0) {
      if ([45, 30, 20, 10].includes(state.secondsLeft)) {
        const xienParts: string[] = [];
        if (state.totalBetTC > 0) xienParts.push(`TC: ${state.totalBetTC.toLocaleString("vi-VN")}`);
        if (state.totalBetTL > 0) xienParts.push(`TL: ${state.totalBetTL.toLocaleString("vi-VN")}`);
        if (state.totalBetXC > 0) xienParts.push(`XC: ${state.totalBetXC.toLocaleString("vi-VN")}`);
        if (state.totalBetXL > 0) xienParts.push(`XL: ${state.totalBetXL.toLocaleString("vi-VN")}`);
        const totalXien = state.totalBetTC + state.totalBetTL + state.totalBetXC + state.totalBetXL;
        const xienDetails = xienParts.length > 0 ? `\n🧩 XIÊN: ${totalXien.toLocaleString("vi-VN")} (${xienParts.join(" | ")})` : "";

        const diceTotals: { [key: string]: number } = {};
        if (state.userBetsDice) {
          Object.values(state.userBetsDice).forEach((list) => {
            list.forEach((b) => {
              const key = b.betType.toUpperCase();
              diceTotals[key] = (diceTotals[key] || 0) + b.amount;
            });
          });
        }
        const diceParts = Object.entries(diceTotals)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([key, val]) => `${key}: ${val.toLocaleString("vi-VN")}`);
        const totalDice = Object.values(diceTotals).reduce((sum, val) => sum + val, 0);
        const diceDetails = diceParts.length > 0 ? `\n🎲 D: ${totalDice.toLocaleString("vi-VN")} (${diceParts.join(" | ")})` : "";

        const sumTotals: { [key: string]: number } = {};
        if (state.userBetsSum) {
          Object.values(state.userBetsSum).forEach((list) => {
            list.forEach((b) => {
              const key = b.betType.toUpperCase();
              sumTotals[key] = (sumTotals[key] || 0) + b.amount;
            });
          });
        }
        const sumParts = Object.entries(sumTotals)
          .sort((a, b) => {
            const numA = parseInt(a[0].replace("SB", ""), 10) || 0;
            const numB = parseInt(b[0].replace("SB", ""), 10) || 0;
            return numA - numB;
          })
          .map(([key, val]) => `${key}: ${val.toLocaleString("vi-VN")}`);
        const totalSum = Object.values(sumTotals).reduce((sum, val) => sum + val, 0);
        const sumDetails = sumParts.length > 0 ? `\n📊 SB: ${totalSum.toLocaleString("vi-VN")} (${sumParts.join(" | ")})` : "";

        const mmTotals: { [key: string]: number } = {};
        if (state.userBetsMM) {
          Object.values(state.userBetsMM).forEach((list) => {
            list.forEach((b) => {
              const rawKey = String(b.betType || "").toLowerCase();
              const mmNum = parseInt(rawKey.replace("mm", ""), 10);
              if (isNaN(mmNum) || mmNum < 1 || mmNum > 9) return;
              const key = `MM${mmNum}`;
              mmTotals[key] = (mmTotals[key] || 0) + (b.amount || 0);
            });
          });
        }
        const mmParts = Object.entries(mmTotals)
          .sort((a, b) => (parseInt(a[0].replace("MM", ""), 10) || 0) - (parseInt(b[0].replace("MM", ""), 10) || 0))
          .map(([key, val]) => `${key}: ${val.toLocaleString("vi-VN")}`);
        const totalMM = Object.values(mmTotals).reduce((sum, val) => sum + val, 0);
        const mmDetails = mmParts.length > 0 ? `\n🎡 MM: ${totalMM.toLocaleString("vi-VN")} (${mmParts.join(" | ")})` : "";

        let counters = `⏰ <b>Còn ${state.secondsLeft} giây phiên #${state.phien}</b>\n` +
          `🔵 TÀI: ${state.totalBetT.toLocaleString("vi-VN")}\n` +
          `🔴 XỈU: ${state.totalBetX.toLocaleString("vi-VN")}\n\n` +
          `⚪️ CHẴN: ${state.totalBetC.toLocaleString("vi-VN")}\n` +
          `⚫️ LẺ: ${state.totalBetL.toLocaleString("vi-VN")}`;
        counters += xienDetails;
        counters += diceDetails;
        counters += sumDetails;
        counters += mmDetails;

        sendMessageToRoom(counters, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "⚡ Nạp Tiền Ngay", url: `https://t.me/${botUsernames[0]}` }]],
          },
        });
      }
    }

    if (state.secondsLeft <= 0) {
      if (activeBetsCount === 0 || totalMoneyBetted === 0) {
        state.phienAnnounced = false;
        state.secondsLeft = 60;
        return;
      }
      lockGroupChat();
      // Chi tiết xiên / D / SB: hiển thị rõ như phần thông báo giây (chỉ hiện khi có cược)
      const xienParts: string[] = [];
      if (state.totalBetTC > 0) xienParts.push(`TC: ${state.totalBetTC.toLocaleString("vi-VN")}`);
      if (state.totalBetTL > 0) xienParts.push(`TL: ${state.totalBetTL.toLocaleString("vi-VN")}`);
      if (state.totalBetXC > 0) xienParts.push(`XC: ${state.totalBetXC.toLocaleString("vi-VN")}`);
      if (state.totalBetXL > 0) xienParts.push(`XL: ${state.totalBetXL.toLocaleString("vi-VN")}`);
      const totalXien = state.totalBetTC + state.totalBetTL + state.totalBetXC + state.totalBetXL;
      const xienDetails = xienParts.length > 0 ? `🧩 XIÊN: ${totalXien.toLocaleString("vi-VN")} (${xienParts.join(" | ")})` : "";

      const diceTotals: { [key: string]: number } = {};
      if (state.userBetsDice) {
        Object.values(state.userBetsDice).forEach((list) => {
          list.forEach((b) => {
            const key = String(b.betType || "").toUpperCase();
            if (!key) return;
            diceTotals[key] = (diceTotals[key] || 0) + (b.amount || 0);
          });
        });
      }
      const diceParts = Object.entries(diceTotals)
        .filter(([, val]) => (val || 0) > 0)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, val]) => `${key}: ${val.toLocaleString("vi-VN")}`);
      const totalDice = diceParts.length > 0 ? Object.values(diceTotals).reduce((sum, val) => sum + (val || 0), 0) : 0;
      const diceDetails = diceParts.length > 0 ? `🎲 D: ${totalDice.toLocaleString("vi-VN")} (${diceParts.join(" | ")})` : "";

      const sumTotals: { [key: string]: number } = {};
      if (state.userBetsSum) {
        Object.values(state.userBetsSum).forEach((list) => {
          list.forEach((b) => {
            const key = String(b.betType || "").toUpperCase();
            if (!key) return;
            sumTotals[key] = (sumTotals[key] || 0) + (b.amount || 0);
          });
        });
      }
      const sumParts = Object.entries(sumTotals)
        .filter(([, val]) => (val || 0) > 0)
        .sort((a, b) => {
          const numA = parseInt(a[0].replace("SB", ""), 10) || 0;
          const numB = parseInt(b[0].replace("SB", ""), 10) || 0;
          return numA - numB;
        })
        .map(([key, val]) => `${key}: ${val.toLocaleString("vi-VN")}`);
      const totalSum = sumParts.length > 0 ? Object.values(sumTotals).reduce((sum, val) => sum + (val || 0), 0) : 0;
      const sumDetails = sumParts.length > 0 ? `📊 SB: ${totalSum.toLocaleString("vi-VN")} (${sumParts.join(" | ")})` : "";

      const mmTotals: { [key: string]: number } = {};
      if (state.userBetsMM) {
        Object.values(state.userBetsMM).forEach((list) => {
          list.forEach((b) => {
            const rawKey = String(b.betType || "").toLowerCase();
            const mmNum = parseInt(rawKey.replace("mm", ""), 10);
            if (isNaN(mmNum) || mmNum < 1 || mmNum > 9) return;
            const key = `MM${mmNum}`;
            mmTotals[key] = (mmTotals[key] || 0) + (b.amount || 0);
          });
        });
      }
      const mmParts = Object.entries(mmTotals)
        .filter(([, val]) => (val || 0) > 0)
        .sort((a, b) => (parseInt(a[0].replace("MM", ""), 10) || 0) - (parseInt(b[0].replace("MM", ""), 10) || 0))
        .map(([key, val]) => `${key}: ${val.toLocaleString("vi-VN")}`);
      const totalMM = mmParts.length > 0 ? Object.values(mmTotals).reduce((sum, val) => sum + (val || 0), 0) : 0;
      const mmDetails = mmParts.length > 0 ? `🎡 MM: ${totalMM.toLocaleString("vi-VN")} (${mmParts.join(" | ")})` : "";

      let lockedMsg =
        `Hết thời gian đặt cược phiên #${state.phien}\n` +
        `🔵 TÀI: ${state.totalBetT.toLocaleString("vi-VN")}\n` +
        `🔴 XỈU: ${state.totalBetX.toLocaleString("vi-VN")}\n\n` +
        `⚪️ CHẴN: ${state.totalBetC.toLocaleString("vi-VN")}\n` +
        `⚫️ LẺ: ${state.totalBetL.toLocaleString("vi-VN")}`;

      const extraBlocks = [xienDetails, diceDetails, sumDetails, mmDetails].filter(Boolean);
      // Không có ai cược xiên / D / SB / MM thì không hiện các dòng này
      if (extraBlocks.length > 0) lockedMsg += `\n\n${extraBlocks.join("\n")}`;
      sendMessageToRoom(lockedMsg, { parse_mode: "HTML" });
      state.gamePhase = "LOCKED";
      state.secondsLeft = 10;
    }
  } else if (state.gamePhase === "LOCKED") {
    state.secondsLeft -= 1;
    if (state.secondsLeft <= 0) {
      state.gamePhase = "ROLLING";
      sendMessageToRoom(`💥 Bắt đầu tung XX phiên #${state.phien} 💥`, { parse_mode: "HTML" });
      // Cho text "Bắt đầu tung" hiện trước, rồi mới tới "Tung XX" và bắt đầu tung xúc xắc
      setTimeout(() => {
        // Bỏ thông báo "🎲 Tung XX phiên #..." để tránh spam nhóm
        sendDice();
      }, 1200);
    }
  } else if (state.gamePhase === "REVEALING") {
    state.secondsLeft -= 1;
    if (state.secondsLeft <= 0) {
      state.phien += 1;
      savePhien();
      state.gamePhase = "BETTING";
      state.secondsLeft = 60;
      resetBettingSession();
      unlockGroupChat();
    }
  }
}

// --- TELEGRAM BOT REGISTER COMMANDS ---
export function registerAllBotCommands() {
  const onAdminCommand = (regex: RegExp, handler: (bot: TelegramBot, msg: TelegramBot.Message, match: RegExpExecArray | null) => void) => {
    const wrap = (bot: TelegramBot, msg: TelegramBot.Message, match: RegExpExecArray | null) => {
      if (isAdminUser(msg.from?.id)) handler(bot, msg, match);
    };
    bot4.onText(regex, (msg, match) => wrap(bot4, msg, match));
    bot1.onText(regex, (msg, match) => wrap(bot1, msg, match));
  };

  const handleCheckCommand = async (bot: TelegramBot, msg: TelegramBot.Message, match: RegExpExecArray | null) => {
    const senderId = msg.from?.id;
    const chatId = msg.chat.id;
    const isAdmin = isAdminUser(senderId);
    let canUse = isAdmin;

    if (!canUse && isGameRoomChat(chatId) && senderId) {
      try {
        const member = await bot1.getChatMember(groupt, senderId);
        canUse = ["creator", "administrator"].includes((member as any)?.status);
      } catch {}
    }

    if (!canUse) return;

    let targetId = "";
    if (match?.[1]) targetId = match[1];
    else if (msg.reply_to_message?.from?.id) targetId = String(msg.reply_to_message.from.id);

    if (!targetId) {
      bot.sendMessage(chatId, `⚠️ Dùng <code>/check [id]</code> hoặc reply vào người cần kiểm tra.`, { parse_mode: "HTML" });
      return;
    }

    const users = readJson(userJsonFile);
    const u = users.find((x: any) => String(x.id) === String(targetId));
    if (!u) {
      bot.sendMessage(chatId, "❌ Không tìm thấy user này.");
      return;
    }

    bot.sendMessage(chatId, formatUserCheckMessage(u), { parse_mode: "HTML" });
  };

  bot1.onText(/^\/check(?:\s+(\d+))?$/, (msg, match) => { handleCheckCommand(bot1, msg, match).catch(() => {}); });
  bot4.onText(/^\/check(?:\s+(\d+))?$/, (msg, match) => { handleCheckCommand(bot4, msg, match).catch(() => {}); });

  onAdminCommand(/^\/thongke/, (bot, msg) => {
    try {
      const users = readJson(userJsonFile);
      let nap = 0, rut = 0, hh = 0, bal = 0;
      users.forEach((u: any) => {
        nap += u.nap || 0;
        rut += u.rut || 0;
        hh += u.hh || 0;
        bal += (u.sd !== undefined ? u.sd : (u.money || 0));
      });
      const pot = readJson("hu.json").pot || 10000;
      bot.sendMessage(msg.chat.id, `💻 <b>THỐNG KÊ HỆ THỐNG:</b>\n• User: <b>${users.length} acc</b>\n• Số dư thành viên: <b>${bal.toLocaleString("vi-VN")} xu</b>\n• Tổng nạp: <b>${nap.toLocaleString("vi-VN")} xu</b>\n• Tổng rút: <b>${rut.toLocaleString("vi-VN")} xu</b>\n• Quỹ hũ rồng: <b>${pot.toLocaleString("vi-VN")} xu</b>`, { parse_mode: "HTML" });
    } catch {
      bot.sendMessage(msg.chat.id, "Lỗi đọc database thống kê.");
    }
  });

  onAdminCommand(/^\/ban (\d+)/, (bot, msg, match) => {
    if (!match) return;
    const target = parseInt(match[1], 10);
    const banned = readJson(banJsonFile);
    if (!banned.some((x: any) => x.id === target)) {
      banned.push({ id: target, reason: "Banned by Admin", time: new Date().toISOString() });
      writeJson(banJsonFile, banned);
      bot.sendMessage(msg.chat.id, `✅ Đã khóa tài khoản ID ${target}.`);
    }
  });

  onAdminCommand(/^\/unban (\d+)/, (bot, msg, match) => {
    if (!match) return;
    const target = match[1];
    let banned = readJson(banJsonFile);
    banned = banned.filter((x: any) => String(x.id) !== String(target));
    writeJson(banJsonFile, banned);
    bot.sendMessage(msg.chat.id, `✅ Đã mở khóa tài khoản ID ${target}.`);
  });

  onAdminCommand(/^\/nap (\d+) (\d+)$/, (bot, msg, match) => {
    if (!match) return;
    const targetId = match[1];
    const money = parseInt(match[2], 10);
    const users = readJson(userJsonFile);
    const idx = users.findIndex((u: any) => String(u.id) === String(targetId));
    if (idx === -1) {
      bot.sendMessage(msg.chat.id, "❌ Thành viên chưa từng start Bot!");
      return;
    }

    const result = addDepositToUser(users[idx], money);

    if (!users[idx].depositHistory) users[idx].depositHistory = [];
    users[idx].depositHistory.unshift({ time: moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD HH:mm:ss"), amount: money.toLocaleString("vi-VN"), status: "Thành công" });
    writeJson(userJsonFile, users);

    bot.sendMessage(msg.chat.id, `✅ Nạp thành công cho <code>${targetId}</code>.`, { parse_mode: "HTML" });

    let notifyMsg = `💸 Bạn được cộng +<b>${money.toLocaleString("vi-VN")} xu</b> nạp tiền thành công!\n`;
    if (result.baseResetOccurred) {
      notifyMsg += `⚠️ <b>Lưu ý:</b> Tài khoản chưa mở khóa tân thủ nên số dư trước đó của bạn đã bị reset về <code>0 xu</code>.\n`;
    }
    if (result.newlyUnlocked) {
      notifyMsg += `🎉 <b>Chúc mừng! Bạn đã mở khóa thành viên Tân Thủ thành công</b> (Tổng nạp đạt ${result.totalNapAfter.toLocaleString("vi-VN")}/20.000 xu).\n`;
    } else if (result.totalNapAfter < 10000000) { // arbitrary, we know totalNapAfter < 20000 from addDepositToUser if not newlyUnlocked and totalNapBefore was < 20000
      if (result.totalNapAfter < 20000) {
        notifyMsg += `🔒 <b>Trạng thái:</b> Chưa mở khóa Tân Thủ (${result.totalNapAfter.toLocaleString("vi-VN")}/20.000 xu).\n`;
      }
    }
    notifyMsg += `🔄 Bạn cần thực hiện cược thêm <b>${money.toLocaleString("vi-VN")} xu</b> (vòng cược x1) trước khi có thể thực hiện rút tiền!`;

    bot1.sendMessage(targetId, notifyMsg, { parse_mode: "HTML" }).catch(() => {});
    sendMessageToRoom(`<b>🤩🏮 ID người chơi: ${formatMaskedId(users[idx].id)} - Ngân hàng Nạp thành công: ${money.toLocaleString("vi-VN")}</b>`, { parse_mode: "HTML" });
  });

  onAdminCommand(/^\/tru (\d+) (\d+)$/, (bot, msg, match) => {
    if (!match) return;
    const targetId = match[1];
    const money = parseInt(match[2], 10);
    const users = readJson(userJsonFile);
    const idx = users.findIndex((u: any) => String(u.id) === String(targetId));
    if (idx !== -1) {
      users[idx].sd = Math.max(0, (users[idx].sd || 0) - money);
      if (users[idx].money !== undefined) users[idx].money = Math.max(0, (users[idx].money || 0) - money);
      writeJson(userJsonFile, users);
      bot.sendMessage(msg.chat.id, `✅ Đã khấu trừ -${money.toLocaleString("vi-VN")} xu của ID ${targetId}.`);
    }
  });

  onAdminCommand(/^\/reset$/, (bot, msg) => {
    if (!isAdminGroupChat(msg.chat.id)) {
      bot.sendMessage(msg.chat.id, "❌ Lệnh này chỉ dùng trong nhóm admin.");
      return;
    }
    writeJson(userJsonFile, []);
    writeJson(banJsonFile, []);
    currentCai.value = null;
    resetBettingSession();
    bot.sendMessage(msg.chat.id, "✅ Đã xóa toàn bộ người dùng và danh sách khóa. Tất cả sẽ quay về trạng thái người chơi mới.");
  });

  onAdminCommand(/^\/resetcode$/, (bot, msg) => {
    if (!isAdminGroupChat(msg.chat.id)) {
      bot.sendMessage(msg.chat.id, "❌ Lệnh này chỉ dùng trong nhóm admin.");
      return;
    }
    writeJson(giftJsonFile, []);
    bot.sendMessage(msg.chat.id, "✅ Đã xóa toàn bộ giftcode trong server.");
  });


  onAdminCommand(/^\/mycode(?:\s+.+)?$/i, (bot, msg) => {
    if (!isAdminGroupChat(msg.chat.id)) {
      bot.sendMessage(msg.chat.id, "❌ Lệnh này chỉ dùng trong nhóm admin.");
      return;
    }

    const rawArgs = String(msg.text || "").replace(/^\/mycode(?:@\w+)?/i, "").trim();
    const parts = rawArgs.split(/\s+/).filter(Boolean);
    if (parts.length !== 2 && parts.length !== 3) {
      bot.sendMessage(
        msg.chat.id,
        `⚠️ <b>Sai cú pháp /mycode</b>\n• Ngẫu nhiên: <code>/mycode [số_xu] [số_lượt]</code>\n• Tự đặt mã: <code>/mycode [mã_code] [số_xu] [số_lượt]</code>\n\nVí dụ:\n• <code>/mycode 10000 5</code>\n• <code>/mycode CODEVIP 10000 5</code>`,
        { parse_mode: "HTML" }
      );
      return;
    }

    let customCode = "";
    let amount = 0;
    let maxUses = 0;
    if (parts.length === 2) {
      amount = parseInt(parts[0], 10);
      maxUses = parseInt(parts[1], 10);
    } else {
      customCode = String(parts[0] || "").trim().toUpperCase();
      amount = parseInt(parts[1], 10);
      maxUses = parseInt(parts[2], 10);
    }

    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(maxUses) || maxUses <= 0) {
      bot.sendMessage(msg.chat.id, "❌ Số tiền và số lượt nhập phải lớn hơn 0.");
      return;
    }

    if (customCode && !/^[A-Z0-9_-]{4,32}$/.test(customCode)) {
      bot.sendMessage(msg.chat.id, "❌ Mã code chỉ được chứa chữ in hoa, số, dấu gạch ngang hoặc gạch dưới, độ dài 4-32 ký tự.");
      return;
    }

    const giftData = readJson(giftJsonFile, "[]");
    const existingCodes = new Set<string>((giftData || []).map((g: any) => String(g.gift || "").toUpperCase()));
    let finalCode = customCode;

    if (finalCode) {
      if (existingCodes.has(finalCode)) {
        bot.sendMessage(msg.chat.id, `❌ Mã <code>${finalCode}</code> đã tồn tại.`, { parse_mode: "HTML" });
        return;
      }
      existingCodes.add(finalCode);
    } else {
      finalCode = generateUniqueAdminGiftCode(existingCodes);
    }

    const record: any = createGiftcodeData(finalCode, amount, `ADMIN_${msg.from?.id || "UNKNOWN"}`, maxUses);
    record.allowWithdrawWithoutDeposit = true;
    record.withdrawCap = 10000;
    giftData.push(record);
    writeJson(giftJsonFile, giftData);

    bot.sendMessage(
      msg.chat.id,
      `✅ <b>Tạo giftcode thành công</b>\n🔑 Mã: <code>/code ${record.gift}</code>\n💰 Mệnh giá: <b>${amount.toLocaleString("vi-VN")} xu</b>\n🔁 Số lượt nhập: <b>${maxUses}</b>\n👤 Cách tạo: <b>${customCode ? "Admin tự đặt mã" : "Mã ngẫu nhiên"}</b>`,
      { parse_mode: "HTML" }
    );
  });

  onAdminCommand(/^\/hs$/, (bot, msg) => {
    if (!isAdminGroupChat(msg.chat.id)) {
      bot.sendMessage(msg.chat.id, "❌ Lệnh này chỉ dùng trong nhóm admin.");
      return;
    }
    const helpText = `🛠️ <b>HƯỚNG DẪN LỆNH ADMIN</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• <code>/hs</code> - Xem hướng dẫn lệnh admin\n` +
      `• <code>/thongke</code> - Xem thống kê hệ thống\n` +
      `• <code>/check [id]</code> - Kiểm tra thông tin user\n` +
      `• <code>/nap [id] [xu]</code> - Cộng nạp cho user\n` +
      `• <code>/tru [id] [xu]</code> - Trừ xu user\n` +
      `• <code>/ban [id]</code> - Khóa tài khoản\n` +
      `• <code>/unban [id]</code> - Mở khóa tài khoản\n` +
      `• <code>/duyet_rut [id] [xu]</code> - Duyệt lệnh rút\n` +
      `• <code>/tuchoi_rut [id] [xu] [lý do]</code> - Từ chối lệnh rút\n` +
      `• <code>/mycode [số_xu] [số_lượt]</code> - Tạo giftcode ngẫu nhiên\n` +
      `• <code>/mycode [mã_code] [số_xu] [số_lượt]</code> - Admin tự đặt tên code\n` +
      `• <code>/reset</code> - Xóa toàn bộ người dùng, reset về người chơi mới\n` +
      `• <code>/resetcode</code> - Xóa toàn bộ giftcode trong server\n\n` +
      `🔐 <i>Lệnh này chỉ admin mới dùng được và chỉ hiển thị trong nhóm admin.</i>`;
    bot.sendMessage(msg.chat.id, helpText, { parse_mode: "HTML" });
  });

  onAdminCommand(/^\/duyet_rut (\d+) (\d+)/, (bot, msg, match) => {
    if (!match) return;
    const targetId = match[1];
    const money = parseInt(match[2], 10);
    const users = readJson(userJsonFile);
    const idx = users.findIndex((u: any) => String(u.id) === String(targetId));
    if (idx !== -1) {
      const u = users[idx];
      let adminMsgId: number | undefined;
      let bankName = "Ngân hàng";
      if (u.withdrawHistory) {
        const item = u.withdrawHistory.find((h: any) => h.status === "Đang xử lý" && String(h.amount) === String(money));
        if (item) {
          item.status = "Thành công";
          adminMsgId = item.adminMessageId;
          bankName = item.bankName || "Ngân hàng";
        }
      }
      writeJson(userJsonFile, users);
      bot.sendMessage(msg.chat.id, `✅ Chấp thuận đơn rút ${money.toLocaleString("vi-VN")} xu cho ID ${targetId}.`);
      bot1.sendMessage(targetId, `✅ Đơn rút xu trị giá <b>${money.toLocaleString("vi-VN")} xu</b> đã được phê duyệt chuyển khoản thành công!`, { parse_mode: "HTML" }).catch(() => {});
      if (adminMsgId) unpinFromAdminGroup(adminMsgId);
      sendMessageToRoom(`<b>🤩🏮 ID người chơi: ${formatMaskedId(u.id)} - ${bankName} Rút thành công: ${money.toLocaleString("vi-VN")}</b>`, { parse_mode: "HTML" });
    }
  });

  onAdminCommand(/^\/tuchoi_rut (\d+) (\d+)(?: (.+))?$/, (bot, msg, match) => {
    if (!match) return;
    const targetId = match[1];
    const money = parseInt(match[2], 10);
    const reason = match[3] || "Sai thông tin";
    const users = readJson(userJsonFile);
    const idx = users.findIndex((u: any) => String(u.id) === String(targetId));
    if (idx !== -1) {
      const u = users[idx];
      let adminMsgId: number | undefined;
      let refundAmount = money;
      if (u.withdrawHistory) {
        const item = u.withdrawHistory.find((h: any) => h.status === "Đang xử lý" && String(h.amount) === String(money));
        if (item) {
          item.status = `Từ chối: ${reason}`;
          adminMsgId = item.adminMessageId;
          const fee = item.fee || 0;
          refundAmount = money + fee;
        }
      }
      u.sd = (u.sd || 0) + refundAmount;
      if (u.money !== undefined) u.money = (u.money || 0) + refundAmount;
      writeJson(userJsonFile, users);
      bot.sendMessage(msg.chat.id, `❌ Đã hủy bỏ đơn rút xu cho ID ${targetId}.`);
      bot1.sendMessage(targetId, `❌ Yêu cầu rút xu ${money.toLocaleString("vi-VN")} xu đã bị từ chối! Hoàn xu ví. Lý do: ${reason}`, { parse_mode: "HTML" }).catch(() => {});
      if (adminMsgId) unpinFromAdminGroup(adminMsgId);
    }
  });

  const handleBet = (chatId: string | number, userId: string, username: string, category: string, type: string, amountStr: string, msgId?: number, isGroup = false, isAnonymous = false) => {
    if (isBanned(userId)) return;
    const sendError = (msgText: string) => {
      if (isAnonymous) bot1.sendMessage(userId, msgText, { parse_mode: "HTML" }).catch(() => {});
      else sendResilientReply(chatId, msgText, { parse_mode: "HTML" });
    };

    if (state.gamePhase !== "BETTING") {
      sendError(`⚠️ <b>Rất tiếc! Hệ thống đang đóng sổ xúc xắc. Cược không hợp lệ!</b>`);
      return;
    }

    try {
      const users = readJson(userJsonFile);
      const uIdx = users.findIndex((u: any) => String(u.id) === String(userId));
      if (uIdx === -1) {
        sendError(`⚠️ Bạn chưa start bot! Click @${botUsernames[0]} gõ <code>/start</code> để đăng ký.`);
        return;
      }
      const user = users[uIdx];
      const activeBetGame = getUserActiveBetGame(user);
      const txBet = state.userBetsTX[userId]?.amount || 0;
      const clBet = state.userBetsCL[userId]?.amount || 0;
      const xBet = state.userBetsXien[userId]?.amount || 0;
      
      let diceBetSum = 0;
      if (state.userBetsDice && state.userBetsDice[userId]) state.userBetsDice[userId].forEach((b: any) => diceBetSum += b.amount);
      let sumBetSum = 0;
      if (state.userBetsSum && state.userBetsSum[userId]) state.userBetsSum[userId].forEach((b: any) => sumBetSum += b.amount);
      let mmBetSum = 0;
      if (state.userBetsMM && state.userBetsMM[userId]) state.userBetsMM[userId].forEach((b: any) => mmBetSum += b.amount);
      const combined = txBet + clBet + xBet + diceBetSum + sumBetSum + mmBetSum;

      if (combined >= SESSION_LIMIT) {
        sendError(`⚠️ Đạt giới hạn cược tối đa ${SESSION_LIMIT.toLocaleString("vi-VN")} xu một phiên!`);
        return;
      }

      const balance = user.sd !== undefined ? user.sd : (user.money || 0);
      let betValue = amountStr.toLowerCase() === "max" ? Math.min(balance, SESSION_LIMIT - combined) : parseInt(amountStr, 10);

      if (isTelegramXXBetType(type)) {
        if (activeBetGame !== "TELEGRAM_XX") {
          bot1.sendMessage(userId, `⚠️ 4 lệnh <code>XXC</code>, <code>XXL</code>, <code>XXX</code>, <code>XXT</code> đang bị khóa. Muốn chơi thì vào bot <b>chọn game XÚC XẮC TELEGRAM</b> trước.`, { parse_mode: "HTML" }).catch(() => {});
          return;
        }
        if (isNaN(betValue) || betValue < TELEGRAM_XX_MIN_BET) {
          sendError(`⚠️ Cược ${getTelegramXXLabel(type)} tối thiểu từ <b>${TELEGRAM_XX_MIN_BET.toLocaleString("vi-VN")} xu</b>!`);
          return;
        }
        if (betValue > TELEGRAM_XX_MAX_BET) {
          sendError(`⚠️ Cược ${getTelegramXXLabel(type)} tối đa <b>${TELEGRAM_XX_MAX_BET.toLocaleString("vi-VN")} xu</b>!`);
          return;
        }
      } else if (isNaN(betValue) || betValue < 1000) {
        sendError("⚠️ Cược tối thiểu từ 1.000 xu!");
        return;
      }
      if (balance < betValue) {
        sendError("⚠️ Số dư ví cược của đệ tử không đủ!");
        return;
      }

      if (category === "TX") {
        if (type === "t" && state.totalBetT + betValue - state.totalBetX > CANCUA_LIMIT) {
          sendError("⚠️ Cửa TÀI đang lệch thặng dư quá lớn!");
          return;
        }
        if (type === "x" && state.totalBetX + betValue - state.totalBetT > CANCUA_LIMIT) {
          sendError("⚠️ Cửa XỈU đang lệch thặng dư quá lớn!");
          return;
        }
      } else if (category === "CL") {
        if (type === "c" && state.totalBetC + betValue - state.totalBetL > CANCUA_LIMIT) {
          sendError("⚠️ Cửa CHẮN đang lệch thặng dư quá lớn!");
          return;
        }
        if (type === "l" && state.totalBetL + betValue - state.totalBetC > CANCUA_LIMIT) {
          sendError("⚠️ Cửa LẺ đang lệch thặng dư quá lớn!");
          return;
        }
      }

      if (category === "TX" && state.userBetsTX[userId] && state.userBetsTX[userId].betType !== type) {
        sendError("⚠️ Không đặt cả 2 bên TÀI - XỈU!");
        return;
      }
      if (category === "CL" && state.userBetsCL[userId] && state.userBetsCL[userId].betType !== type) {
        sendError("⚠️ Không đặt cả 2 bên CHẮN - LẺ!");
        return;
      }
      if (category === "MM") {
        const mmNum = parseInt(String(type || "").toLowerCase().replace("mm", ""), 10);
        if (isNaN(mmNum) || mmNum < 1 || mmNum > 9) {
          sendError("⚠️ MM chỉ nhận số từ 1-9. VD: <code>MM 5 20000</code>");
          return;
        }
        const existingMMBet = (state.userBetsMM?.[userId] || []).find(
          (b) => String(b.betType || "").toLowerCase() !== String(type || "").toLowerCase()
        );
        if (existingMMBet) {
          const existingMMNum = parseInt(String(existingMMBet.betType || "").toLowerCase().replace("mm", ""), 10);
          sendError(`⚠️ MM chỉ được cược 1 số trong 1 phiên. Bạn đã cược số ${existingMMNum}.`);
          return;
        }
      }

      checkAndResetUserBets(user);
      if (user.sd !== undefined) user.sd -= betValue;
      if (user.money !== undefined) user.money -= betValue;
      
      user.cuoc = (user.cuoc || 0) + betValue;
      user.cuocHomNay = (user.cuocHomNay || 0) + betValue;
      user.cuocTuanNay = (user.cuocTuanNay || 0) + betValue;
      const vipPointGained = applyVipPointFromBet(user, betValue);
      if (user.vongCuoc && user.vongCuoc > 0) user.vongCuoc = Math.max(0, user.vongCuoc - betValue);

      if (category === "TX") {
        if (!state.userBetsTX[userId]) state.userBetsTX[userId] = { betType: type, amount: 0 };
        state.userBetsTX[userId].amount += betValue;
        if (type === "t") state.totalBetT += betValue;
        else state.totalBetX += betValue;
      } else if (category === "CL") {
        if (!state.userBetsCL[userId]) state.userBetsCL[userId] = { betType: type, amount: 0 };
        state.userBetsCL[userId].amount += betValue;
        if (type === "c") state.totalBetC += betValue;
        else state.totalBetL += betValue;
      } else if (category === "MM") {
        if (!state.userBetsMM) state.userBetsMM = {};
        if (!state.userBetsMM[userId]) state.userBetsMM[userId] = [];
        const existing = state.userBetsMM[userId].find((b) => String(b.betType || "").toLowerCase() === String(type || "").toLowerCase());
        if (existing) existing.amount += betValue;
        else state.userBetsMM[userId].push({ betType: type, amount: betValue });
        state.totalBetMM += betValue;
      } else if (category === "DICE") {
        if (!state.userBetsDice) state.userBetsDice = {};
        if (!state.userBetsDice[userId]) state.userBetsDice[userId] = [];
        const existing = state.userBetsDice[userId].find((b) => b.betType === type);
        if (existing) existing.amount += betValue;
        else state.userBetsDice[userId].push({ betType: type, amount: betValue });
      } else if (category === "SUM") {
        if (!state.userBetsSum) state.userBetsSum = {};
        if (!state.userBetsSum[userId]) state.userBetsSum[userId] = [];
        const existing = state.userBetsSum[userId].find((b) => b.betType === type);
        if (existing) existing.amount += betValue;
        else state.userBetsSum[userId].push({ betType: type, amount: betValue });
      } else {
        if (!state.userBetsXien[userId]) state.userBetsXien[userId] = { betType: type, amount: 0 };
        state.userBetsXien[userId].amount += betValue;
        if (type === "tc") state.totalBetTC += betValue;
        else if (type === "tl") state.totalBetTL += betValue;
        else if (type === "xc") state.totalBetXC += betValue;
        else if (type === "xl") state.totalBetXL += betValue;
      }

      state.betsLog.push({ userId, username, category, betType: type, amount: betValue });
      writeJson(userJsonFile, users);

      let typeLabel = type === "t" ? "TÀI"
        : type === "x" ? "XỈU"
        : type === "c" ? "CHẮN"
        : type === "l" ? "LẺ"
        : String(type || "").toLowerCase().startsWith("mm") ? `MM ${parseInt(String(type || "").toLowerCase().replace("mm", ""), 10)}`
        : isTelegramXXBetType(type) ? getTelegramXXLabel(type)
        : type.toUpperCase();
      const finalBalance = user.sd !== undefined ? user.sd : (user.money || 0);
      const vipInfo = getVipTierInfo(user);
      const badgePrefix = getVipRoomBadgePrefix(user);
      const anonymousBadge = vipInfo.level > 0 ? vipInfo.badge : "👤";
      const anonymousLabel = vipInfo.level > 0 ? `VIP${vipInfo.level} Ẩn Danh` : "Ẩn Danh";
      const publicBetSummary = `${isAnonymous ? anonymousBadge : "✅"} <b>${isAnonymous ? anonymousLabel : `${badgePrefix}${username}`}</b> cược thành công <b>${typeLabel}</b> • <b>${betValue.toLocaleString("vi-VN")} xu</b> • phiên <b>#${state.phien}</b>`;
      const privateAnonymousSummary = `🕵️ <b>${anonymousLabel}</b> cược thành công <b>${typeLabel}</b> • <b>${betValue.toLocaleString("vi-VN")} xu</b> • phiên <b>#${state.phien}</b>`;
      const mainBotRoomSummary =
        `${anonymousBadge} <b>${anonymousLabel}</b> cược tại <b>BOT CHÍNH</b> thành công\n` +
        `🎯 Cửa: <b>${typeLabel}</b>\n` +
        `💸 Số tiền: <b>${betValue.toLocaleString("vi-VN")} xu</b>\n` +
        `🎲 Phiên: <b>#${state.phien}</b>`;
      const privateBetReceipt = `✅ <b>Đặt lệnh thành công ${typeLabel}</b>\n` +
        `💸 Số tiền: <b>${betValue.toLocaleString("vi-VN")} xu</b>\n` +
        `🎲 Phiên: <b>#${state.phien}</b>\n` +
        `👑 VIP hiện tại: <b>VIP${vipInfo.level} ${vipInfo.badge} (${vipInfo.name})</b>\n` +
        `🚀 Điểm VIP hiện có: <b>${vipInfo.points.toLocaleString("vi-VN")}</b>${vipPointGained ? ` | +<b>1</b> điểm` : ""}\n` +
        `💰 SD hiện tại: <b>${finalBalance.toLocaleString("vi-VN")} xu</b>`;

      if (isAnonymous) {
        bot1.sendMessage(userId, privateAnonymousSummary, { parse_mode: "HTML" }).catch(() => {});
        bot1.sendMessage(userId, privateBetReceipt, { parse_mode: "HTML" }).catch(() => {});
        sendMessageToRoom(publicBetSummary, { parse_mode: "HTML" });
      } else if (isGroup && msgId) {
        sendResilientReply(chatId, publicBetSummary, { reply_to_message_id: msgId, parse_mode: "HTML" });
        bot1.sendMessage(userId, privateBetReceipt, { parse_mode: "HTML" }).catch(() => {});
      } else {
        sendResilientReply(chatId, `🕵️ <b>${vipInfo.level > 0 ? `VIP${vipInfo.level} ` : ""}Khớp cược thành công</b> <b>${typeLabel}</b> • <b>${betValue.toLocaleString("vi-VN")} xu</b> • phiên <b>#${state.phien}</b> • ví <b>${finalBalance.toLocaleString("vi-VN")} xu</b>.`, { parse_mode: "HTML" });
        sendMessageToRoom(mainBotRoomSummary, { parse_mode: "HTML" });
      }
    } catch {}
  };

  const processedGroupMessages = new Set<string>();
  const groupMessageProcessor = (bot: TelegramBot, msg: TelegramBot.Message) => {
    if (!msg.text) return;
    const chat = msg.chat.id;
    if (String(chat) !== String(groupt)) return;

    const msgKey = `${chat}_${msg.message_id}`;
    if (processedGroupMessages.has(msgKey)) return;
    processedGroupMessages.add(msgKey);

    const text = msg.text.trim();
    const words = text.toLowerCase().split(/\s+/);
    const firstWord = words[0];
    const isAnonymous = ["tt", "xx", "cc", "ll"].includes(firstWord);

    if (isAnonymous) bot.deleteMessage(chat, msg.message_id).catch(() => {});

    const parsed = parseBetText(text);
    if (parsed) {
      if (isTelegramXXBetType(parsed.type)) {
        const uid = String(msg.from?.id || "");
        if (uid) {
          bot1.sendMessage(uid, `⚠️ Các lệnh <code>XXC</code>, <code>XXL</code>, <code>XXX</code>, <code>XXT</code> không nhận trong room. Muốn chơi thì vào bot <b>chọn game XÚC XẮC TELEGRAM</b>.`, { parse_mode: "HTML" }).catch(() => {});
        }
        return;
      }
      const name = msg.from?.first_name || msg.from?.username || "Ẩn danh";
      const uid = String(msg.from?.id || "");
      if (uid) handleBet(chat, uid, name, parsed.category, parsed.type, parsed.amountStr, msg.message_id, true, isAnonymous);
    }
  };

  bots.forEach((b) => b.on("message", (msg) => {
    const text = msg.text?.trim();
    if (!text) return;

    if (/^\/daythang(?:@\w+)?$/i.test(text) || /^\/daythua(?:@\w+)?$/i.test(text)) {
      if (String(msg.chat.id) !== String(groupt) || b !== bot1) return;
      try {
        const users = readJson(userJsonFile);
        const requesterId = msg.from?.id ? String(msg.from.id) : "";
        const response = /^\/daythang(?:@\w+)?$/i.test(text)
          ? formatDailyStreakTopRoomMessage(users, "win", requesterId)
          : formatDailyStreakTopRoomMessage(users, "loss", requesterId);
        b.sendMessage(msg.chat.id, response, { parse_mode: "HTML" });
      } catch {
        b.sendMessage(msg.chat.id, "Không đọc được bảng xếp hạng hôm nay.", { parse_mode: "HTML" });
      }
      return;
    }

    if (text.startsWith('/sd') || text.startsWith('/sodu')) {
      if (b !== bot1) return;
      const userId = msg.from?.id ? msg.from.id.toString() : null;
      if (!userId) return;
      try {
        const users = readJson(userJsonFile);
        const user = users.find((u: any) => String(u.id) === userId);
        if (!user) {
          b.sendMessage(msg.chat.id, `⚠️ Tài khoản chưa được đăng ký! Gõ /start tại @${botUsernames[0]}!`);
          return;
        }
        const bal = user.sd !== undefined ? user.sd : (user.money || 0);
        b.sendMessage(msg.chat.id, `🤖 <b>VÍ CỦA BẠN</b>\n👤 Tên: <b>${user.name}</b>\n💰 Số dư: <b>${bal.toLocaleString('vi-VN')} xu</b>\n🔥 Dây hiện tại: <b>${getUserStreakStatusText(user)}</b>`, { parse_mode: 'HTML' });
      } catch {}
      return;
    }

    if (text.startsWith('/')) return;
    groupMessageProcessor(b, msg);
  }));

  bot1.on("message", (msg) => {
    if (msg.chat.type !== "private" || !msg.text) return;
    const txt = msg.text.trim();
    const chat = msg.chat.id;

    if (txt === "🎲 GAME SOLO XÚC XẮC" || txt === "🎲 Game Solo") {
      bot1.sendMessage(chat, formatSoloLobbyMessage(), { parse_mode: "HTML" });
      return;
    }

    if (txt === "🎲 XÚC XẮC TELEGRAM" || txt === "🎲 GAME XÚC XẮC TELEGRAM") {
      const users = readJson(userJsonFile);
      const user = users.find((u: any) => String(u.id) === String(chat));
      if (user) {
        user.activeBetGame = "TELEGRAM_XX";
        writeJson(userJsonFile, users);
      }
      bot1.sendMessage(chat, `✅ Bạn đã chọn game <b>XÚC XẮC TELEGRAM</b>.\nTừ giờ 4 lệnh <code>XXC</code>, <code>XXL</code>, <code>XXX</code>, <code>XXT</code> mới được mở.\n\n${formatTelegramXXGuideMessage()}`, { parse_mode: "HTML" });
      return;
    }

    if (txt === "📚 Danh Sách Game" || txt === "🎲 Đặt Cược Phòng") {
      const users = readJson(userJsonFile);
      const user = users.find((u: any) => String(u.id) === String(chat));
      if (user) {
        user.activeBetGame = "ROOM_DEFAULT";
        writeJson(userJsonFile, users);
      }
      const guideText = formatGameCatalogMessage();

      bot1.sendMessage(chat, guideText, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: getGameCatalogReplyMarkup()
      });
      return;
    }

    if (txt === "🎖 Đua Tôp" || txt === "🥇 Bảng Phong Thần") {
      bot1.sendMessage(
        chat,
        `🎖 <b>ĐUA TÔP HÔM NAY</b>\nChọn bảng xếp hạng bên dưới:`,
        { parse_mode: "HTML", reply_markup: getDuaTopReplyMarkup() }
      );
      return;
    }

    if (txt === "🔥 Nổ Hũ Rồng") {
      let pot = 10000;
      try { pot = readJson("hu.json").pot || 10000; } catch {}
      bot1.sendMessage(chat, `🔥 <b>HŨ RỒNG HOÀNG KIM:</b> <b>${pot.toLocaleString("vi-VN")} xu</b>\n\nNổ hũ khi ba mặt xúc xắc trùng 1-1-1 hoặc 6-6-6!\n💬 <a href="${gameRoomLink}">Bấm nhanh vào phòng cược</a>`, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [[{ text: "💬 Vào phòng cược ngay", url: gameRoomLink }]] }
      });
      return;
    }

    if (txt === "🏮 Đại Lý Hoa Hồng" || txt === "🏮 Hoa Hồng") {
      const users = readJson(userJsonFile);
      const u = users.find((p: any) => String(p.id) === String(chat));
      if (u) {
        const referralLink = buildReferralDeepLink(String(u.id));
        bot1.sendMessage(chat, `🏮 <b>HOA HỒNG NHÓM ĐẠI LÝ:</b>\n💰 Hoa hồng tích lũy: <b>${(u.hh || 0).toLocaleString("vi-VN")} xu</b>\n\n🎁 <b>Hoa hồng giới thiệu 1%:</b>\nMời bạn bè đăng ký qua link giới thiệu bên dưới. Khi người được giới thiệu cược thua, bạn sẽ được hưởng <b>1%</b> giá trị cược thua vào ví hoa hồng.\n🔗 <a href="${referralLink}">Link giới thiệu của bạn</a>`, {
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔗 Mở Link Giới Thiệu", url: referralLink }],
              [{ text: "🎒 Nhận Hoa Hồng Ví", callback_data: "claim_hh" }]
            ]
          }
        });
      }
      return;
    }

    if (txt === "👑 Víp" || txt === "👑 VIP" || txt === "👑 Vip") {
      const users = readJson(userJsonFile);
      const u = users.find((p: any) => String(p.id) === String(chat));
      if (u) {
        bot1.sendMessage(chat, formatVipGuideMessage(u), { parse_mode: "HTML" });
      }
      return;
    }

    if (txt === "🎪 EVENT" || txt === "🎪 Event") {
      const users = readJson(userJsonFile);
      const user = users.find((p: any) => String(p.id) === String(chat));
      if (!user) {
        bot1.sendMessage(chat, `❌ Bạn chưa đăng ký tài khoản! Gõ /start để đăng ký.`);
        return;
      }

      const todayKey = getVNDateKey();
      const yesterdayKey = getVNDateKey(moment().tz("Asia/Ho_Chi_Minh").subtract(1, "day"));
      const lastKey = String((user as any)?.eventCheckinLastDate || "");
      const rawStreak = Number((user as any)?.eventCheckinStreak || 0);
      const effectiveStreak = lastKey === todayKey || lastKey === yesterdayKey ? rawStreak : 0;
      const depositToday = getUserSuccessfulDepositTotalOnDate(user, todayKey);

      const displayName = `${msg.from?.first_name || ""} ${msg.from?.last_name || ""}`.trim() || (msg.from?.username ? `@${msg.from.username}` : "Người chơi");
      const text =
        `🖼 <b>EVENT TREO ẢNH / ĐIỂM DANH Dragon.Room</b>\n\n` +
        `✅ Đổi tên Telegram có chứa <b>${EVENT_KEYWORD}</b>\n` +
        `✅ Mỗi ngày điểm danh 1 lần\n` +
        `✅ Mỗi ngày phải nạp tối thiểu <b>${EVENT_DAILY_MIN_DEPOSIT.toLocaleString("vi-VN")}đ</b> mới được điểm danh\n` +
        `✅ Đủ <b>${EVENT_STREAK_TARGET_DAYS} ngày</b> liên tục và có nạp trong <b>${EVENT_STREAK_TARGET_DAYS} ngày</b> gần nhất\n\n` +
        `🎁 Thưởng: <b>Giftcode ${EVENT_REWARD_GIFTCODE_VALUE.toLocaleString("vi-VN")}</b>\n` +
        `👉 Sau khi đổi tên xong, bấm <b>✅ Điểm danh</b> để ghi nhận.\n\n` +
        `👤 Tên Telegram: <b>${displayName}</b>\n` +
        `📥 Nạp hôm nay: <b>${depositToday.toLocaleString("vi-VN")}đ</b>\n` +
        `🔥 Tiến độ: <b>${effectiveStreak}/${EVENT_STREAK_TARGET_DAYS}</b> ngày`;

      bot1.sendMessage(chat, text, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "✅ Điểm danh", callback_data: "event_checkin" }]] }
      });
      return;
    }

    if (txt === "👤 Ví Cá Nhân") {
      const users = readJson(userJsonFile);
      const u = users.find((p: any) => String(p.id) === String(chat));
      if (u) {
        const bal = u.sd !== undefined ? u.sd : (u.money || 0);
        const mapTotal = u.nap || 0;
        const activeStreak = getUserActiveStreakCounts(u);
        const rookieStatus = mapTotal >= 20000 
          ? `🟢 <b>Đã mở khóa ✅</b>` 
          : `🔴 <b>Chưa mở khóa ❌ (${mapTotal.toLocaleString("vi-VN")}/20.000 xu)</b>`;

        const vipInfo = getVipTierInfo(u);
        const redeemablePoints = getVipRedeemablePoints(u);
        const stats = `👤 <b>VÍ TÀI KHOẢN:</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🆔 ID: <code>${u.id}</code>\n` +
          `💵 Số dư: <b>${Math.floor(bal).toLocaleString("vi-VN")} xu</b>\n` +
          `👑 <b>Víp</b> 👑\n` +
          `Cấp Vip hiện tại: <b>${vipInfo.level}</b> ${vipInfo.badge} (<b>${vipInfo.name}</b>)\n` +
          `🚀 Điểm VIP: <b>${vipInfo.points.toLocaleString("vi-VN")}/${vipInfo.nextThresholdPoints.toLocaleString("vi-VN")} up VIP ${vipInfo.nextTier?.level || vipInfo.level}</b>\n` +
          `🖐️ Số điểm VIP có thể đổi: <b>${redeemablePoints.toLocaleString("vi-VN")}</b>\n` +
          `Doanh số cược: <b>${(u.cuoc || 0).toLocaleString("vi-VN")} xu</b>\n` +
          `🔄 Vòng cược còn lại: <b>${Math.ceil(u.vongCuoc || 0).toLocaleString("vi-VN")} xu</b>\n` +
          `🔰 Tân Thủ: ${rookieStatus}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `📊 <b>Tổng cược hôm nay:</b> <b>${(u.cuocHomNay || 0).toLocaleString("vi-VN")} xu</b>\n` +
          `📈 <b>Tổng cược tuần:</b> <b>${(u.cuocTuanNay || 0).toLocaleString("vi-VN")} xu</b>\n` +
          `🔥 <b>Dây thắng hiện tại:</b> <b>${activeStreak.win}</b> phiên\n` +
          `🥶 <b>Dây thua hiện tại:</b> <b>${activeStreak.loss}</b> phiên\n` +
          `🏆 <b>Trạng thái BXH:</b> <b>${getUserStreakStatusText(u)}</b>\n` +
          `📥 <b>Tổng nạp:</b> <b>${(u.nap || 0).toLocaleString("vi-VN")} xu</b>\n` +
          `📤 <b>Tổng rút:</b> <b>${(u.rut || 0).toLocaleString("vi-VN")} xu</b>`;
        bot1.sendMessage(chat, stats, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📥 Nạp Xu", callback_data: "deposit" }, { text: "📤 Rút Bank", callback_data: "withdraw" }],
              [{ text: "👑 Víp", callback_data: "vip_info" }],
              [{ text: "🔑 Nhập Giftcode", callback_data: "redeem_gift" }],
              [{ text: "🎟️ Mua Giftcode", callback_data: "buy_giftcode" }],
              [{ text: "📜 LS Cược", callback_data: "history_bet" }, { text: "📜 LS Nạp", callback_data: "history_dep" }, { text: "📜 LS Rút", callback_data: "history_wit" }]
            ]
          }
        });
      }
      return;
    }

    const parsed = parseBetText(txt);
    if (parsed) {
      if (isTelegramXXBetType(parsed.type)) {
        bot1.sendMessage(chat, `⚠️ Các lệnh <code>XXC</code>, <code>XXL</code>, <code>XXX</code>, <code>XXT</code> chỉ dùng cho game <b>XÚC XẮC TELEGRAM</b> trong room cược.`, { parse_mode: "HTML" });
        return;
      }
      handleBet(chat, String(chat), msg.from?.first_name || "Ẩn danh", parsed.category, parsed.type, parsed.amountStr);
    }
  });

  bot1.onText(/^solo\s+(\d+)$/i, (msg, match) => {
    const chat = msg.chat.id;
    const userId = String(msg.from?.id || "");
    if (!userId || isBanned(userId) || !match) return;
    if (msg.chat.type !== "private") {
      bot1.sendMessage(chat, "⚠️ Tạo phòng SOLO chỉ dùng trong chat riêng với bot chính.");
      return;
    }

    const amount = parseInt(match[1], 10);
    if (isNaN(amount) || amount < SOLO_MIN_BET) {
      bot1.sendMessage(chat, `❌ Số tiền SOLO tối thiểu là <b>${SOLO_MIN_BET.toLocaleString("vi-VN")} xu</b>.`, { parse_mode: "HTML" });
      return;
    }

    try {
      const users = readJson(userJsonFile);
      const user = users.find((u: any) => String(u.id) === userId);
      if (!user) {
        bot1.sendMessage(chat, `❌ Bạn chưa đăng ký tài khoản! Gõ /start để đăng ký.`);
        return;
      }

      const soloRooms = readSoloRooms();
      const hasOpenRoom = soloRooms.some((room) =>
        ["OPEN", "ROLLING"].includes(room.status) &&
        (String(room.ownerId) === userId || String(room.challengerId || "") === userId)
      );
      if (hasOpenRoom) {
        bot1.sendMessage(chat, `❌ Bạn đang có phòng SOLO đang chờ hoặc đang giữ kèo. Hãy vào/hủy/xử lý xong phòng cũ trước.`);
        return;
      }

      const balance = getUserBalance(user);
      if (balance < amount) {
        bot1.sendMessage(chat, `❌ Số dư không đủ tạo phòng SOLO. Bạn cần <b>${amount.toLocaleString("vi-VN")} xu</b>.`, { parse_mode: "HTML" });
        return;
      }

      setUserBalance(user, balance - amount);
      user.cuoc = (user.cuoc || 0) + amount;
      user.cuocHomNay = (user.cuocHomNay || 0) + amount;
      user.cuocTuanNay = (user.cuocTuanNay || 0) + amount;
      if (user.vongCuoc && user.vongCuoc > 0) user.vongCuoc = Math.max(0, user.vongCuoc - amount);

      const code = generateSoloRoomCode(new Set(soloRooms.map((room) => room.code)));
      const room: SoloRoom = {
        code,
        amount,
        ownerId: userId,
        ownerName: user.name || msg.from?.first_name || "Chủ phòng",
        ownerChatId: userId,
        challengerId: null,
        challengerName: null,
        challengerChatId: null,
        ownerRoll: null,
        challengerRoll: null,
        ownerTotal: null,
        challengerTotal: null,
        winnerId: null,
        loserId: null,
        payout: null,
        status: "OPEN",
        createdAt: Date.now(),
        joinedAt: null,
        settledAt: null,
        rollDeadlineAt: null,
        pinnedMessageId: null,
        resultReason: null
      };

      soloRooms.push(room);
      writeJson(userJsonFile, users);

      sendAndPinToGameRoom(
        formatSoloPinnedRoomMessage(room),
        {
          reply_markup: {
            inline_keyboard: [[{ text: "⚔️ Vào bot để nhập lệnh phòng", url: buildSoloRoomDeepLink(room.code) }]]
          }
        },
        (pinnedId) => {
          room.pinnedMessageId = pinnedId;
          writeSoloRooms(soloRooms);
        }
      );

      writeSoloRooms(soloRooms);

      const reply = `✅ <b>TẠO PHÒNG SOLO THÀNH CÔNG</b>\n` +
        `🎟 Mã phòng: <code>${code}</code>\n` +
        `💰 Mức cược: <b>${amount.toLocaleString("vi-VN")} xu</b>\n` +
        `💵 Ví còn lại: <b>${getUserBalance(user).toLocaleString("vi-VN")} xu</b>\n` +
        `📌 Bot đã ghim lệnh phòng trong room <a href="${gameRoomLink}">Dragon Room</a>.\n` +
        `👥 Bạn bè vào phòng bằng lệnh: <code>/solo ${code}</code>\n` +
        `⛔ Có thể hủy bằng: <code>/huy ${code}</code> sau 1 phút nếu chưa có ai vào.\n\n` +
        formatSoloLobbyMessage(soloRooms);

      bot1.sendMessage(chat, reply, { parse_mode: "HTML" });
    } catch (e) {
      console.error("solo create error:", e);
      bot1.sendMessage(chat, "❌ Có lỗi khi tạo phòng SOLO.");
    }
  });

  bot1.onText(/^\/solo$/i, (msg) => {
    const chat = msg.chat.id;
    if (isBanned(msg.from?.id || chat)) return;
    if (msg.chat.type !== "private") {
      bot1.sendMessage(chat, "⚠️ Vui lòng mở chat riêng với bot chính để xem phòng SOLO.");
      return;
    }
    bot1.sendMessage(chat, formatSoloLobbyMessage(), { parse_mode: "HTML" });
  });

  bot1.onText(/^\/solo\s+([A-Z0-9]+)$/i, (msg, match) => {
    const chat = msg.chat.id;
    const userId = String(msg.from?.id || "");
    if (!userId || isBanned(userId) || !match) return;
    if (msg.chat.type !== "private") {
      bot1.sendMessage(chat, "⚠️ Vào phòng SOLO chỉ dùng trong chat riêng với bot chính.");
      return;
    }
    const roomCode = match[1].toUpperCase();

    try {
      const users = readJson(userJsonFile);
      const joiner = users.find((u: any) => String(u.id) === userId);
      if (!joiner) {
        bot1.sendMessage(chat, `❌ Bạn chưa đăng ký tài khoản! Gõ /start để đăng ký.`);
        return;
      }

      const soloRooms = readSoloRooms();
      const room = soloRooms.find((item) => item.code === roomCode);
      if (!room || room.status !== "OPEN" || room.challengerId) {
        bot1.sendMessage(chat, `❌ Mã phòng SOLO không tồn tại hoặc đã được khớp.`);
        return;
      }

      if (String(room.ownerId) === userId) {
        bot1.sendMessage(chat, `❌ Bạn không thể tự vào phòng của chính mình.`);
        return;
      }

      const occupied = soloRooms.some((item) =>
        ["OPEN", "ROLLING"].includes(item.status) &&
        (String(item.ownerId) === userId || String(item.challengerId || "") === userId)
      );
      if (occupied) {
        bot1.sendMessage(chat, `❌ Bạn đang có một phòng SOLO đang chờ xử lý.`);
        return;
      }

      const balance = getUserBalance(joiner);
      if (balance < room.amount) {
        bot1.sendMessage(chat, `❌ Số dư không đủ vào phòng. Cần <b>${room.amount.toLocaleString("vi-VN")} xu</b>.`, { parse_mode: "HTML" });
        return;
      }

      const owner = users.find((u: any) => String(u.id) === String(room.ownerId));
      if (!owner) {
        room.status = "CANCELLED";
        room.settledAt = Date.now();
        room.resultReason = "Chủ phòng không còn hợp lệ.";
        clearSoloRoomPin(room);
        writeSoloRooms(soloRooms);
        bot1.sendMessage(chat, `❌ Chủ phòng không còn hợp lệ. Vui lòng thử phòng khác.`);
        return;
      }

      setUserBalance(joiner, balance - room.amount);
      joiner.cuoc = (joiner.cuoc || 0) + room.amount;
      joiner.cuocHomNay = (joiner.cuocHomNay || 0) + room.amount;
      joiner.cuocTuanNay = (joiner.cuocTuanNay || 0) + room.amount;
      if (joiner.vongCuoc && joiner.vongCuoc > 0) joiner.vongCuoc = Math.max(0, joiner.vongCuoc - room.amount);

      room.challengerId = userId;
      room.challengerName = joiner.name || msg.from?.first_name || "Đối thủ";
      room.challengerChatId = userId;
      room.joinedAt = Date.now();
      room.status = "ROLLING";
      room.rollDeadlineAt = Date.now() + SOLO_ROLL_TIMEOUT_MS;
      room.resultReason = null;

      clearSoloRoomPin(room);

      writeJson(userJsonFile, users);
      writeSoloRooms(soloRooms);

      const ownerPrompt = formatSoloRollPrompt(room, room.ownerId);
      const challengerPrompt = formatSoloRollPrompt(room, room.challengerId!);
      sendSoloReply(room.ownerChatId, ownerPrompt, { parse_mode: "HTML", reply_markup: getSoloRollReplyMarkup(room.code) });
      sendSoloReply(room.challengerChatId || chat, challengerPrompt, { parse_mode: "HTML", reply_markup: getSoloRollReplyMarkup(room.code) });
    } catch (e) {
      console.error("solo join error:", e);
      bot1.sendMessage(chat, "❌ Có lỗi khi vào phòng SOLO.");
    }
  });

  bot1.onText(/^\/xx\s+([A-Z0-9]+)$/i, async (msg, match) => {
    const chat = msg.chat.id;
    const userId = String(msg.from?.id || "");
    if (!userId || isBanned(userId) || !match) return;
    if (msg.chat.type !== "private") {
      bot1.sendMessage(chat, "⚠️ Tung XX SOLO chỉ dùng trong chat riêng với bot chính.");
      return;
    }
    const roomCode = match[1].toUpperCase();

    try {
      const result = await handleSoloRollAction(roomCode, userId, chat);
      if (!result.ok) {
        bot1.sendMessage(chat, `❌ ${result.callbackText}`, { parse_mode: "HTML" });
      }
    } catch (e) {
      console.error("solo roll error:", e);
      bot1.sendMessage(chat, "❌ Có lỗi khi tung xúc xắc SOLO.");
    }
  });

  bot1.onText(/^\/huy\s+([A-Z0-9]+)$/i, (msg, match) => {
    const chat = msg.chat.id;
    const userId = String(msg.from?.id || "");
    if (!userId || isBanned(userId) || !match) return;
    if (msg.chat.type !== "private") {
      bot1.sendMessage(chat, "⚠️ Hủy phòng SOLO chỉ dùng trong chat riêng với bot chính.");
      return;
    }
    const roomCode = match[1].toUpperCase();

    try {
      const users = readJson(userJsonFile);
      const roomOwner = users.find((u: any) => String(u.id) === userId);
      if (!roomOwner) {
        bot1.sendMessage(chat, `❌ Bạn chưa đăng ký tài khoản! Gõ /start để đăng ký.`);
        return;
      }

      const soloRooms = readSoloRooms();
      const room = soloRooms.find((item) => item.code === roomCode);
      if (!room) {
        bot1.sendMessage(chat, `❌ Không tìm thấy phòng SOLO này.`);
        return;
      }
      if (String(room.ownerId) !== userId) {
        bot1.sendMessage(chat, `❌ Chỉ chủ phòng mới được hủy phòng này.`);
        return;
      }
      if (room.status !== "OPEN" || room.challengerId) {
        bot1.sendMessage(chat, `❌ Không thể hủy phòng vì đã có người vào hoặc phòng đã kết thúc.`);
        return;
      }
      if (Date.now() - room.createdAt < 60_000) {
        bot1.sendMessage(chat, `❌ Chỉ được hủy phòng sau <b>1 phút</b> kể từ lúc tạo phòng.`, { parse_mode: "HTML" });
        return;
      }

      setUserBalance(roomOwner, getUserBalance(roomOwner) + room.amount);
      room.status = "CANCELLED";
      room.settledAt = Date.now();
      room.resultReason = "Chủ phòng chủ động hủy khi chưa có ai vào.";
      clearSoloRoomPin(room);

      writeJson(userJsonFile, users);
      writeSoloRooms(soloRooms);

      bot1.sendMessage(chat, `✅ Đã hủy phòng <code>${room.code}</code> và hoàn lại <b>${room.amount.toLocaleString("vi-VN")} xu</b> vào ví của bạn.\n\n${formatSoloLobbyMessage(soloRooms)}`, { parse_mode: "HTML" });
    } catch (e) {
      console.error("solo cancel error:", e);
      bot1.sendMessage(chat, "❌ Có lỗi khi hủy phòng SOLO.");
    }
  });

  bot1.on("callback_query", async (q) => {
    const act = q.data;
    const chat = q.message?.chat.id;
    if (!chat || !act || isBanned(chat)) return;

    try {
      const users = readJson(userJsonFile);
      const user = users.find((u: any) => String(u.id) === String(chat));
      if (!user) return;

      if (act.startsWith("solo_roll_")) {
        const roomCode = act.replace("solo_roll_", "").toUpperCase();
        const result = await handleSoloRollAction(roomCode, String(chat), chat);
        bot1.answerCallbackQuery(q.id, { text: result.callbackText, show_alert: !result.ok && !!result.showAlert }).catch(() => {});
        return;
      } else if (act === "game_catalog_room_default") {
        user.activeBetGame = "ROOM_DEFAULT";
        writeJson(userJsonFile, users);
        bot1.sendMessage(
          chat,
          `✅ Bạn đã chọn game <b>TÀI XỈU SĂN HŨ</b>.\nTừ giờ các lệnh cược phòng mặc định sẽ được ưu tiên.\n\n${formatRoomDefaultGuideMessage()}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: [[{ text: "💬 Vào Phòng Dragon Room", url: gameRoomLink }]] }
          }
        );
        bot1.answerCallbackQuery(q.id, { text: "Đã mở Tài Xỉu Săn Hũ" }).catch(() => {});
        return;
      } else if (act === "game_catalog_solo") {
        bot1.sendMessage(
          chat,
          `✅ Bạn đã chọn <b>GAME SOLO XÚC XẮC</b>.\n\n${formatSoloLobbyMessage()}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        bot1.answerCallbackQuery(q.id, { text: "Đã mở Game Solo Xúc Xắc" }).catch(() => {});
        return;
      } else if (act === "game_catalog_telegram") {
        user.activeBetGame = "TELEGRAM_XX";
        writeJson(userJsonFile, users);
        bot1.sendMessage(
          chat,
          `✅ Bạn đã chọn game <b>XÚC XẮC TELEGRAM</b>.\nTừ giờ 4 lệnh <code>XXC</code>, <code>XXL</code>, <code>XXX</code>, <code>XXT</code> mới được mở.\n\n${formatTelegramXXGuideMessage()}`,
          { parse_mode: "HTML" }
        );
        bot1.answerCallbackQuery(q.id, { text: "Đã mở Xúc Xắc Telegram" }).catch(() => {});
        return;
      } else if (act === "duatop_du_day") {
        const todayStr = moment().tz("Asia/Ho_Chi_Minh").format("YYYY/MM/DD");
        const latestCompletedPhien = getLatestCompletedPhien();
        const streakLb = buildDailyStreakLeaderboard(users, todayStr, latestCompletedPhien);

        let response = `🔥 <b>BXH ĐU DÂY HÔM NAY (${todayStr})</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

        if (streakLb.length === 0) {
          response += `<i>Chưa có ai đạt dây thắng hoặc dây thua từ ${DAILY_STREAK_MIN} phiên liên tiếp và không bỏ lỡ phiên nào.</i>\n`;
        } else {
          streakLb.slice(0, 3).forEach((entry: any, idx: number) => {
            const u = entry.user;
            const streak = entry.streak;
            const crown = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
            response += `${crown} <b>TOP ${idx + 1}:</b> <code>User****${String(u.id).slice(-4)}</code> - ${streak.label}: <b>${streak.count}</b> phiên\n`;
          });
        }

        response += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🎁 <b>THƯỞNG BXH ĐU DÂY MỖI NGÀY:</b>\n` +
          `• 🥇 <b>TOP 1:</b> Giftcode <b>${DAILY_STREAK_PRIZES[0].toLocaleString("vi-VN")} xu</b>\n` +
          `• 🥈 <b>TOP 2:</b> Giftcode <b>${DAILY_STREAK_PRIZES[1].toLocaleString("vi-VN")} xu</b>\n` +
          `• 🥉 <b>TOP 3:</b> Giftcode <b>${DAILY_STREAK_PRIZES[2].toLocaleString("vi-VN")} xu</b>\n` +
          `\n` +
          `⚠️ <b>GHI CHÚ:</b>\n` +
          `- Chỉ tính <b>dây thắng</b> hoặc <b>dây thua</b> từ <b>${DAILY_STREAK_MIN} phiên liên tiếp</b> trở lên\n` +
          `- <b>Không được bỏ lỡ phiên nào</b>, hễ bỏ lỡ là đứt dây\n` +
          `- Bot tự trao giftcode lúc <b>00:00 hằng ngày</b> và tự reset sau 00:00.\n\n` +
          `👉 <i>Nếu cùng số phiên, hệ thống ưu tiên người có tổng cược hôm nay cao hơn.</i>`;

        bot1.sendMessage(chat, response, { parse_mode: "HTML" });
        bot1.answerCallbackQuery(q.id, { text: "Đã mở BXH Đu Dây" }).catch(() => {});
        return;
      } else if (act === "duatop_phong_than") {
        const todayStr = moment().tz("Asia/Ho_Chi_Minh").format("YYYY/MM/DD");
        const phongThanLb = users
          .filter((u: any) => (u.cuocHomNay || 0) >= 2000000)
          .sort((a: any, b: any) => (b.cuocHomNay || 0) - (a.cuocHomNay || 0));

        let response = `🏆 <b>BXH PHONG THẦN HÔM NAY (${todayStr})</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

        if (phongThanLb.length === 0) {
          response += `<i>Chưa có ai đạt mốc tối thiểu 2.000.000 xu cược hôm nay.</i>\n`;
        } else {
          phongThanLb.slice(0, 3).forEach((u: any, idx: number) => {
            const crown = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
            response += `${crown} <b>TOP ${idx + 1}:</b> <code>User****${String(u.id).slice(-4)}</code> - Cược: <b>${(u.cuocHomNay || 0).toLocaleString("vi-VN")} xu</b>\n`;
          });
        }

        response += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚠️ <b>GHI CHÚ:</b>\n` +
          `- Chỉ tính người chơi có tổng cược hôm nay từ <b>2.000.000 xu</b> trở lên\n` +
          `- Xếp hạng theo <b>tổng cược hôm nay</b> (cao hơn đứng trên)\n` +
          `- BXH sẽ tự reset sau <b>00:00</b> mỗi ngày`;

        bot1.sendMessage(chat, response, { parse_mode: "HTML" });
        bot1.answerCallbackQuery(q.id, { text: "Đã mở BXH Phong Thần" }).catch(() => {});
        return;
      } else if (act === "vip_info") {
        bot1.sendMessage(chat, formatVipGuideMessage(user), { parse_mode: "HTML" });
        bot1.answerCallbackQuery(q.id).catch(() => {});
        return;
      } else if (act === "claim_hh") {
        const value = user.hh || 0;
        if (value <= 0) {
          bot1.answerCallbackQuery(q.id, { text: "Ví hoa hồng đang trống!", show_alert: true });
          return;
        }
        user.sd = (user.sd || 0) + value;
        if (user.money !== undefined) user.money = (user.money || 0) + value;
        user.hh = 0;
        writeJson(userJsonFile, users);
        bot1.sendMessage(chat, `✅ Đã nhận +${value.toLocaleString("vi-VN")} xu hoa hồng!`);
        bot1.answerCallbackQuery(q.id, { text: "Thao tác thành công!" });
      } else if (act === "deposit") {
        bot1.sendMessage(
          chat,
          `💳 <b>Chọn hình thức nạp tiền</b>\n\n• <b>Ngân hàng:</b> tạo giao dịch chuyển khoản tự động.\n• <b>Thẻ cào:</b> nạp Viettel / Vinaphone / Mobifone (lệnh <code>/thecao</code>).\n\n👉 <b>Bấm nút bên dưới để tiếp tục.</b>`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🏦 Bank", callback_data: "deposit_bank" }],
                [{ text: "🎫 Thẻ cào (bảo trì)", callback_data: "deposit_card_maintenance" }]
              ]
            }
          }
        );
      } else if (act === "deposit_bank") {
        bot1.sendMessage(
          chat,
          `💳 <b>Chọn mệnh giá nạp tiền</b>\n\nNạp tối thiểu: <b>10.000 ₫</b>\nNạp tối đa: <b>500.000.000 ₫</b>\n\nBấm vào button dưới để nạp tiền qua <b>Chuyển khoản Ngân hàng</b>\n\n➡️ <b>Cách lấy thông tin nạp:</b>\n\n🔶 Gõ lệnh: <code>/nap số tiền</code>\nVí dụ: <code>/nap 100000</code>\n\n🔶 Hoặc bấm nút số tiền bên dưới để lấy nhanh.\n\n⚠️ <b>Lưu ý:</b>\n\n✅ Chuyển đúng <b>SỐ TIỀN</b> và <b>NỘI DUNG</b> được cung cấp.\n✅ Mỗi lần nạp cần lấy thông tin <b>MỚI</b>.\n🚫 Không dùng thông tin cũ cho giao dịch sau.\n💰 Nạp tối thiểu: <b>10.000đ</b>`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "10.000", callback_data: "deposit_quick_10000" },
                  { text: "20.000", callback_data: "deposit_quick_20000" },
                  { text: "50.000", callback_data: "deposit_quick_50000" }
                ],
                [
                  { text: "100.000", callback_data: "deposit_quick_100000" },
                  { text: "200.000", callback_data: "deposit_quick_200000" },
                  { text: "300.000", callback_data: "deposit_quick_300000" }
                ],
                [
                  { text: "500.000", callback_data: "deposit_quick_500000" },
                  { text: "1.000.000", callback_data: "deposit_quick_1000000" },
                  { text: "2.000.000", callback_data: "deposit_quick_2000000" }
                ],
                [
                  { text: "3.000.000", callback_data: "deposit_quick_3000000" }
                ]
              ]
            }
          }
        );
        bot1.answerCallbackQuery(q.id).catch(() => {});
      } else if (act.startsWith("deposit_quick_")) {
        const amount = parseInt(act.replace("deposit_quick_", ""), 10);
        const minDeposit = 10000;
        const maxDeposit = 500000000;
        if (isNaN(amount) || amount < minDeposit || amount > maxDeposit) {
          bot1.answerCallbackQuery(q.id, { text: "❌ Mệnh giá không hợp lệ.", show_alert: true }).catch(() => {});
          return;
        }

        const cooldownRemaining = getDepositOrderCooldownRemainingSeconds(user);
        if (cooldownRemaining > 0) {
          bot1.answerCallbackQuery(q.id, {
            text: `⏳ Vui lòng chờ ${cooldownRemaining} giây nữa để tạo lệnh nạp tiếp theo.`,
            show_alert: true
          }).catch(() => {});
          return;
        }

        const req = createManualDepositRequest(user, chat, amount);
        writeJson(userJsonFile, users);

        const qrImageUrl = buildDepositQrImageUrl(amount, req.content);
        bot1.sendPhoto(chat, qrImageUrl, {
          caption: formatDepositOrderCaption(amount, req.content),
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "✅ Đã Chuyển Khoản", callback_data: `deposit_sent_${req.requestId}` }]]
          }
        }).catch(() => {
          bot1.sendMessage(chat, formatDepositOrderCaption(amount, req.content), {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[{ text: "✅ Đã Chuyển Khoản", callback_data: `deposit_sent_${req.requestId}` }]]
            }
          });
        });
        bot1.answerCallbackQuery(q.id, { text: `Đã tạo lệnh nạp ${amount.toLocaleString("vi-VN")} ₫!` }).catch(() => {});
      } else if (act.startsWith("deposit_sent_")) {
        const requestId = act.replace("deposit_sent_", "");
        const depositItem = (user.depositHistory || []).find((h: any) => String(h.requestId || "") === requestId);
        if (!depositItem) {
          bot1.answerCallbackQuery(q.id, { text: "❌ Không tìm thấy lệnh nạp này.", show_alert: true }).catch(() => {});
          return;
        }
        if (depositItem.adminNotified) {
          bot1.answerCallbackQuery(q.id, { text: "⚠️ Đơn nạp này đã được gửi admin trước đó.", show_alert: true }).catch(() => {});
          return;
        }
        if (depositItem.expiresAt && moment().tz("Asia/Ho_Chi_Minh").isAfter(moment.tz(depositItem.expiresAt, "Asia/Ho_Chi_Minh"))) {
          depositItem.status = "Hết hạn";
          writeJson(userJsonFile, users);
          bot1.answerCallbackQuery(q.id, { text: "❌ Lệnh nạp đã hết hiệu lực, vui lòng tạo lệnh mới.", show_alert: true }).catch(() => {});
          return;
        }

        depositItem.status = "Chờ kiểm tra";
        depositItem.adminNotified = true;
        writeJson(userJsonFile, users);

        sendMessageToAdminGroup(`⚠️ <b>BÁO NẠP MỚI:</b>\nID: <code>${chat}</code>\nSố tiền: <b>${depositItem.amount} ₫</b>\nNội dung nạp: <code>${depositItem.transferContent}</code>\nDuyệt gõ: <code>/nap ${chat} ${String(depositItem.amount).replace(/\./g, "")}</code>`, { parse_mode: "HTML" });
        if (q.message?.message_id) {
          bot1.editMessageReplyMarkup(
            { inline_keyboard: [] },
            {
              chat_id: chat,
              message_id: q.message.message_id
            }
          ).catch(() => {});
        }
        bot1.answerCallbackQuery(q.id, { text: "✅ Đã gửi đơn nạp về nhóm admin!" }).catch(() => {});
        bot1.sendMessage(chat, `✅ Bạn đã xác nhận chuyển khoản thành công. Đơn nạp đã được gửi về admin để kiểm tra.`, { parse_mode: "HTML" });
      } else if (act === "deposit_card_maintenance") {
        bot1.answerCallbackQuery(q.id, { text: "⚠️ Thẻ cào hiện đang bảo trì, vui lòng quay lại sau.", show_alert: true }).catch(() => {});
      } else if (act === "withdraw") {
        const adminGiftWithdrawQuota = Math.max(0, Math.floor(Number(user.adminGiftWithdrawQuota) || 0));
        const canWithdrawByAdminGift = !isNoviceUnlocked(user) && adminGiftWithdrawQuota > 0;
        if (!isNoviceUnlocked(user) && !canWithdrawByAdminGift) {
          bot1.answerCallbackQuery(q.id, { text: "❌ Tân thủ phải nạp đủ 20.000 xu để mở khóa trước khi tạo lệnh rút.", show_alert: true });
          return;
        }
        if (canWithdrawByAdminGift) {
          const adminGiftLimit = Math.min(10000, adminGiftWithdrawQuota);
          bot1.sendMessage(chat, `📤 <b>RÚT TIỀN VỀ THẺ:</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 <b>Quyền rút từ code admin:</b> Tối đa <b>${adminGiftLimit.toLocaleString("vi-VN")} xu</b>
⚖️ <b>Phí giao dịch rút:</b> 1% (khấu trừ từ số xu rút)

🏦 <b>Hệ thống hỗ trợ các ngân hàng:</b>
<code>Vietcombank</code> | <code>Techcombank</code> | <code>MBBank</code> | <code>Vietinbank</code> | <code>Agribank</code>

✍️ <b>Cú pháp soạn tin nhắn gửi Bot:</b>
<code>/rut [STK] [BANK] [TÊN_CHỦ_THẺ] [TIỀN]</code>

💡 <b>Ví dụ mẫu:</b>
<code>/rut 190345 Techcombank BUI_THI_ANH_THY ${adminGiftLimit.toLocaleString("vi-VN")}</code>`, { parse_mode: "HTML" });
          return;
        }
        bot1.sendMessage(chat, `📤 <b>RÚT TIỀN THẮNG LỚN VỀ THẺ:</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚖️ <b>Hạn mức & Phí rút:</b>
• <b>Hạn mức tối thiểu (Min):</b> 50.000 xu
• <b>Phí giao dịch rút:</b> 1% (khấu trừ từ số xu rút)

🏦 <b>Hệ thống hỗ trợ các ngân hàng:</b>
<code>Vietcombank</code> | <code>Techcombank</code> | <code>MBBank</code> | <code>Vietinbank</code> | <code>Agribank</code>

✍️ <b>Cú pháp soạn tin nhắn gửi Bot:</b>
<code>/rut [STK] [BANK] [TÊN_CHỦ_THẺ] [TIỀN]</code>

💡 <b>Ví dụ mẫu:</b>
<code>/rut 190345 Techcombank BUI_THI_ANH_THY 50000</code>`, { parse_mode: "HTML" });
      } else if (act === "redeem_gift") {
        bot1.sendMessage(chat, "🔑 Soạn mẫu: <code>/code [Mã_quà_tặng]</code>", { parse_mode: "HTML" });
      } else if (act === "buy_giftcode") {
        if (!isNoviceUnlocked(user)) {
          bot1.answerCallbackQuery(q.id, { text: "❌ Bạn phải mở khóa tân thủ trước mới mua được code.", show_alert: true });
          return;
        }
        const bal = user.sd !== undefined ? user.sd : (user.money || 0);
        const buyIntro = `🎟️ <b>MUA GIFTCODE LỘC CHIA SẺ</b> 🎟️\n💵 Số dư ví của bạn: <b>${Math.floor(bal).toLocaleString("vi-VN")} xu</b>\n⚠️ Mua code mất <code>3%</code> phí giao dịch.\n\n👉 <b>Cú pháp mua tùy chọn:</b>\n• <code>/muacode [mệnh_giá]</code>\n• <code>/muacode [số_lượng] [mệnh_giá]</code>\n💡 <b>Ví dụ:</b> <code>/muacode 10000</code> hoặc <code>/muacode 5 10000</code>`;
        bot1.sendMessage(chat, buyIntro, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎟️ Gói 10K xu", callback_data: "buy_quick_10000" }, { text: "🎟️ Gói 50K xu", callback_data: "buy_quick_50000" }],
              [{ text: "🎟️ Gói 100K xu", callback_data: "buy_quick_100000" }]
            ]
          }
        });
      } else if (act.startsWith("buy_quick_")) {
        if (!isNoviceUnlocked(user)) {
          bot1.answerCallbackQuery(q.id, { text: "❌ Bạn phải mở khóa tân thủ trước mới mua được code.", show_alert: true });
          return;
        }
        const price = parseInt(act.replace("buy_quick_", ""), 10);
        if (isNaN(price) || price < 1000) return;
        const cost = Math.ceil(price * 1.03); // 3% fee!
        const balance = user.sd !== undefined ? user.sd : (user.money || 0);
        if (balance < cost) {
          bot1.answerCallbackQuery(q.id, { text: `❌ Số dư không đủ! Cần ${cost.toLocaleString("vi-VN")} xu.`, show_alert: true });
          return;
        }

        user.sd = balance - cost;
        if (user.money !== undefined) user.money = user.money - cost;

        const generatedCode = generateGiftCode();
        const codeRecord = createGiftcodeData(generatedCode, price, String(chat), 1, new Date().toLocaleString("vi-VN"));

        const giftcodes = readJson(giftJsonFile);
        writeJson(giftJsonFile, [...giftcodes, codeRecord]);
        
        const userList = readJson(userJsonFile);
        const uToUpdate = userList.find((x: any) => String(x.id) === String(chat));
        if (uToUpdate) {
          uToUpdate.sd = user.sd;
          if (uToUpdate.money !== undefined) uToUpdate.money = user.money;
          writeJson(userJsonFile, userList);
        }

        bot1.answerCallbackQuery(q.id, { text: `🎉 Đã mua thành công mã ${price.toLocaleString("vi-VN")} xu!` });
        bot1.sendMessage(chat, `🎟️ <b>MUA GIFTCODE THÀNH CÔNG!</b>\n💎 Mệnh giá: <b>${price.toLocaleString("vi-VN")} xu</b>\n🔑 Mã: <code>/code ${generatedCode}</code>`, { parse_mode: "HTML" });
        sendMessageToRoom(`👥 <b>Người chơi ẩn danh</b> đã mua <b>1</b> giftcode mệnh giá <b>${price.toLocaleString("vi-VN")} xu</b>!`, { parse_mode: "HTML" });
      } else if (act === "event_checkin") {
        const todayKey = getVNDateKey();
        const yesterdayKey = getVNDateKey(moment().tz("Asia/Ho_Chi_Minh").subtract(1, "day"));

        if (!isTelegramNameQualified(q.from, EVENT_KEYWORD)) {
          const msgStr =
            `❌ Bạn chưa đủ điều kiện điểm danh.\n\n` +
            `Yêu cầu 1: Đổi tên Telegram có chứa <b>${EVENT_KEYWORD}</b>\n` +
            `👉 Đổi tên xong bấm lại <b>✅ Điểm danh</b> để ghi nhận.`;
          bot1.sendMessage(chat, msgStr, { parse_mode: "HTML" });
          bot1.answerCallbackQuery(q.id, { text: "Chưa đúng tên Telegram", show_alert: true }).catch(() => {});
          return;
        }

        const depositToday = getUserSuccessfulDepositTotalOnDate(user, todayKey);
        if (depositToday < EVENT_DAILY_MIN_DEPOSIT) {
          const msgStr =
            `❌ Bạn chưa đủ điều kiện điểm danh.\n\n` +
            `Yêu cầu 2: Hôm nay phải nạp tối thiểu <b>${EVENT_DAILY_MIN_DEPOSIT.toLocaleString("vi-VN")}đ</b> mới được điểm danh.\n` +
            `📥 Nạp hôm nay của bạn: <b>${depositToday.toLocaleString("vi-VN")}đ</b>`;
          bot1.sendMessage(chat, msgStr, { parse_mode: "HTML" });
          bot1.answerCallbackQuery(q.id, { text: "Chưa đủ nạp hôm nay", show_alert: true }).catch(() => {});
          return;
        }

        const lastKey = String((user as any).eventCheckinLastDate || "");
        if (lastKey === todayKey) {
          bot1.answerCallbackQuery(q.id, { text: "Bạn đã điểm danh hôm nay rồi!", show_alert: true }).catch(() => {});
          return;
        }

        let streak = Number((user as any).eventCheckinStreak || 0);
        streak = lastKey === yesterdayKey ? (streak + 1) : 1;
        (user as any).eventCheckinLastDate = todayKey;
        (user as any).eventCheckinStreak = streak;

        let msgStr =
          `✅ <b>ĐIỂM DANH THÀNH CÔNG!</b>\n` +
          `📅 Ngày: <b>${todayKey}</b>\n` +
          `📥 Nạp hôm nay: <b>${depositToday.toLocaleString("vi-VN")}đ</b>\n` +
          `🔥 Tiến độ: <b>${streak}/${EVENT_STREAK_TARGET_DAYS}</b> ngày liên tục`;

        if (streak >= EVENT_STREAK_TARGET_DAYS) {
          const hasDeposit7d = hasUserSuccessfulDepositInLastDays(user, EVENT_STREAK_TARGET_DAYS);
          if (!hasDeposit7d) {
            msgStr +=
              `\n\n⚠️ Bạn đã đủ ${EVENT_STREAK_TARGET_DAYS} ngày điểm danh nhưng chưa có nạp trong ${EVENT_STREAK_TARGET_DAYS} ngày gần nhất.`;
          } else {
            const code = createGiftcodeRecord(EVENT_REWARD_GIFTCODE_VALUE, "EVENT_CHECKIN");
            msgStr +=
              `\n\n🎉 <b>CHÚC MỪNG BẠN ĐỦ ${EVENT_STREAK_TARGET_DAYS} NGÀY LIÊN TỤC!</b>\n` +
              `🎁 Thưởng: <b>Giftcode ${EVENT_REWARD_GIFTCODE_VALUE.toLocaleString("vi-VN")}</b>\n` +
              `🔑 Mã: <code>/code ${code}</code>\n\n` +
              `✅ Chu kỳ điểm danh đã reset, mai bạn có thể bắt đầu vòng mới.`;
            (user as any).eventCheckinStreak = 0;
          }
        }

        writeJson(userJsonFile, users);
        bot1.sendMessage(chat, msgStr, { parse_mode: "HTML" });
        bot1.answerCallbackQuery(q.id, { text: "Đã điểm danh!" }).catch(() => {});
      } else if (act === "history_bet") {
        const lastBets = (user.betHistory || []).slice().reverse().slice(0, 5);
        let msgStr = `📜 <b>LỊCH SỬ CƯỢC GẦN ĐÂY:</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        if (lastBets.length === 0) {
          msgStr += `<i>Chưa có lịch sử cược nào!</i>`;
        } else {
          lastBets.forEach((h: any) => {
            msgStr += `🔮 <b>Phiên #${h.phien}</b> (${h.time})\n🎲 Dice: <b>${h.dice}</b> (${h.total} - ${h.result})\n`;
            if (Array.isArray(h.bets)) {
              h.bets.forEach((b: any) => {
                const labelType = typeof b.betType === "function" ? "CHẮN/LẺ" : b.betType;
                msgStr += `  • ${b.isWin ? "🟢 Thắng" : "🔴 Thua"} ${b.category.toUpperCase()} [${String(labelType).toUpperCase()}]: ${b.amount.toLocaleString("vi-VN")} xu ${b.isWin ? `(+${b.payout.toLocaleString("vi-VN")} xu)` : ""}\n`;
              });
            }
          });
        }
        bot1.sendMessage(chat, msgStr, { parse_mode: "HTML" });
        bot1.answerCallbackQuery(q.id).catch(() => {});
      } else if (act === "history_dep") {
        const history = (user.depositHistory || []).slice(0, 5);
        let msgStr = `📥 <b>LỊCH SỬ NẠP GẦN ĐÂY:</b>\n`;
        history.forEach((h: any, idx: number) => {
          msgStr += `${idx + 1}. <b>${h.amount}</b> (${h.time}) - <b>${h.status || "Xong"}</b>\n`;
          if (h.transferContent) msgStr += `📝 Nội dung: <code>${h.transferContent}</code>\n`;
        });
        bot1.sendMessage(chat, msgStr || "Trống", { parse_mode: "HTML" });
        bot1.answerCallbackQuery(q.id).catch(() => {});
      } else if (act === "history_wit") {
        const history = (user.withdrawHistory || []).slice(0, 5);
        let msgStr = `📤 <b>LỊCH SỬ RÚT GẦN ĐÂY:</b>\n`;
        history.forEach((h: any, idx: number) => {
          msgStr += `${idx + 1}. <b>${h.amount.toLocaleString("vi-VN")} xu</b> (${h.time}) - <b>${h.status || "Xử lý"}</b>\n`;
        });
        bot1.sendMessage(chat, msgStr || "Trống", { parse_mode: "HTML" });
        bot1.answerCallbackQuery(q.id).catch(() => {});
      }
    } catch {}
  });

  bot1.onText(/\/nap (\d+)/, (msg, match) => {
    const chat = msg.chat.id;
    if (isBanned(chat) || !match) return;
    const amount = parseInt(match[1], 10);
    const minDeposit = 10000;
    const maxDeposit = 500000000;
    if (isNaN(amount) || amount < minDeposit || amount > maxDeposit) {
      bot1.sendMessage(chat, `❌ Số tiền nạp không hợp lệ. Tối thiểu <b>${minDeposit.toLocaleString("vi-VN")} ₫</b> và tối đa <b>${maxDeposit.toLocaleString("vi-VN")} ₫</b>.`, { parse_mode: "HTML" });
      return;
    }

    try {
      const users = readJson(userJsonFile);
      const idx = users.findIndex((u: any) => String(u.id) === String(chat));
      if (idx === -1) return;
      const user = users[idx];

      const cooldownRemaining = getDepositOrderCooldownRemainingSeconds(user);
      if (cooldownRemaining > 0) {
        bot1.sendMessage(chat, `⏳ Vui lòng chờ <b>${cooldownRemaining} giây</b> nữa để tạo lệnh nạp tiếp theo.`, { parse_mode: "HTML" });
        return;
      }

      const req = createManualDepositRequest(user, chat, amount);
      writeJson(userJsonFile, users);

      const qrImageUrl = buildDepositQrImageUrl(amount, req.content);
      bot1.sendPhoto(chat, qrImageUrl, {
        caption: formatDepositOrderCaption(amount, req.content),
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "✅ Đã Chuyển Khoản", callback_data: `deposit_sent_${req.requestId}` }]]
        }
      }).catch(() => {
        bot1.sendMessage(chat, formatDepositOrderCaption(amount, req.content), {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "✅ Đã Chuyển Khoản", callback_data: `deposit_sent_${req.requestId}` }]]
          }
        });
      });
    } catch {}
  });

  bot1.onText(/\/rut (.+)/, (msg, match) => {
    const chat = msg.chat.id;
    if (isBanned(chat) || !match) return;

    const parts = match[1].trim().split(/\s+/);
    if (parts.length < 4) {
      bot1.sendMessage(chat, `⚠️ <b>Sai cú pháp rút tiền!</b>\n✍️ <code>/rut [STK] [BANK] [TÊN_CHỦ_THẺ] [TIỀN]</code>`, { parse_mode: "HTML" });
      return;
    }

    const account = parts[0];
    const bank = parts[1].toUpperCase();
    const money = parseInt(parts[parts.length - 1], 10);
    const owner = parts.slice(2, parts.length - 1).join(" ").toUpperCase();

    const minWithdraw = 50000;
    if (isNaN(money) || money < minWithdraw) {
      bot1.sendMessage(chat, `❌ Hạn mức rút tối thiểu ${minWithdraw.toLocaleString("vi-VN")} xu!`);
      return;
    }

    try {
      const users = readJson(userJsonFile);
      const idx = users.findIndex((u: any) => String(u.id) === String(chat));
      if (idx === -1) return;
      const user = users[idx];
      const adminGiftWithdrawQuota = Math.max(0, Math.floor(Number(user.adminGiftWithdrawQuota) || 0));
      const canWithdrawByAdminGift = !isNoviceUnlocked(user) && adminGiftWithdrawQuota > 0;

      if (!isNoviceUnlocked(user) && !canWithdrawByAdminGift) {
        bot1.sendMessage(chat, `❌ Tài khoản tân thủ phải nạp đủ <b>20.000 xu</b> và mở khóa tân thủ trước khi tạo lệnh rút.`, { parse_mode: "HTML" });
        return;
      }

      if (canWithdrawByAdminGift) {
        const adminGiftLimit = Math.min(10000, adminGiftWithdrawQuota);
        if (isNaN(money) || money <= 0 || money > adminGiftLimit) {
          bot1.sendMessage(chat, `❌ Với code admin, bạn chỉ được rút tối đa <b>${adminGiftLimit.toLocaleString("vi-VN")} xu</b>.`, { parse_mode: "HTML" });
          return;
        }
      }

      if (user.vongCuoc && user.vongCuoc > 0) {
        bot1.sendMessage(chat, `❌ Chưa hoàn tất vòng cược! Cần cược thêm <b>${Math.ceil(user.vongCuoc).toLocaleString("vi-VN")} xu</b>.`, { parse_mode: "HTML" });
        return;
      }

      const fee = Math.ceil(money * 0.01);
      const totalDeduct = money + fee;
      const balance = user.sd !== undefined ? user.sd : (user.money || 0);
      if (balance < totalDeduct) {
        bot1.sendMessage(chat, `❌ Không đủ số dư ví kèm 1% phí (Cần: ${totalDeduct.toLocaleString("vi-VN")} xu)!`);
        return;
      }

      if (user.sd !== undefined) user.sd -= totalDeduct;
      if (user.money !== undefined) user.money -= totalDeduct;
      if (canWithdrawByAdminGift) {
        user.adminGiftWithdrawQuota = Math.max(0, adminGiftWithdrawQuota - money);
      }
      user.rut = (user.rut || 0) + money;

      if (!user.withdrawHistory) user.withdrawHistory = [];
      user.withdrawHistory.unshift({ time: moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD HH:mm:ss"), amount: money, fee: fee, receiveAmount: money, bankNo: account, bankName: bank, bankUser: owner, status: "Đang xử lý" });
      writeJson(userJsonFile, users);

      bot1.sendMessage(chat, `✅ Lập đơn rút xu ${money.toLocaleString("vi-VN")} xu thành công! Chờ Admin phê duyệt.`);

      const ticket = `⚠️ <b>RÚT TIỀN CHỜ DUYỆT</b>\nID: <code>${chat}</code>\nSố xu rút: ${money.toLocaleString("vi-VN")}\nThực nhận (100%): <b>${money.toLocaleString("vi-VN")} xu</b>\nTổng nạp: <b>${(user.nap || 0).toLocaleString("vi-VN")} xu</b>\nTổng rút: <b>${(user.rut || 0).toLocaleString("vi-VN")} xu</b>\nBank: ${bank} | ${account} | ${owner}\n\nDuyệt: <code>/duyet_rut ${chat} ${money}</code>\nTừ chối: <code>/tuchoi_rut ${chat} ${money} [Lý do]</code>`;
      sendAndPinToAdminGroup(ticket, (pinnedId) => {
        try {
          const list = readJson(userJsonFile);
          const current = list.find((p: any) => String(p.id) === String(chat));
          if (current?.withdrawHistory) {
            const hIdx = current.withdrawHistory.findIndex((h: any) => h.status === "Đang xử lý" && h.amount === money);
            if (hIdx !== -1) {
              current.withdrawHistory[hIdx].adminMessageId = pinnedId;
              writeJson(userJsonFile, list);
            }
          }
        } catch {}
      });
    } catch {}
  });

  bot1.onText(/\/code (.+)/, (msg, match) => {
    const chat = msg.chat.id;
    if (isBanned(chat) || !match) return;
    const code = match[1].trim().toUpperCase();

    try {
      const gList = readJson(giftJsonFile);
      const gIdx = gList.findIndex((g: any) => String(g.gift || "").toUpperCase() === code);
      if (gIdx === -1) {
        bot1.sendMessage(chat, `❌ Mã Giftcode lộc không tồn tại!`);
        return;
      }
      const g = gList[gIdx];
      const isAdminMyCode = g.allowWithdrawWithoutDeposit === true || String(g.creatorId || "").startsWith("ADMIN_");
      const usedByList = Array.isArray(g.usedBy)
        ? g.usedBy.map((id: any) => String(id))
        : (g.userIdUsed ? [String(g.userIdUsed)] : []);
      const maxUses = Math.max(1, Math.floor(Number(g.maxUses) || 1));
      const usedCount = Math.max(0, Math.floor(Number(g.usedCount) || usedByList.length));

      if (usedByList.includes(String(chat))) {
        bot1.sendMessage(chat, `❌ Bạn đã nhập giftcode này rồi!`);
        return;
      }

      if (usedCount >= maxUses) {
        bot1.sendMessage(chat, `❌ Mã quà tặng đã hết lượt sử dụng!`);
        return;
      }

      const users = readJson(userJsonFile);
      const uIdx = users.findIndex((u: any) => String(u.id) === String(chat));
      if (uIdx === -1) return;

      users[uIdx].sd = (users[uIdx].sd || 0) + g.value;
      if (users[uIdx].money !== undefined) users[uIdx].money = (users[uIdx].money || 0) + g.value;
      users[uIdx].vongCuoc = (users[uIdx].vongCuoc || 0) + g.value;
      if (isAdminMyCode) {
        const withdrawCap = Math.min(Number(g.withdrawCap) || 10000, g.value);
        users[uIdx].adminGiftWithdrawQuota = Math.max(0, Math.floor(Number(users[uIdx].adminGiftWithdrawQuota) || 0)) + withdrawCap;
      }

      const useTime = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD HH:mm:ss");
      const nextUsedBy = [...usedByList, String(chat)];
      g.maxUses = maxUses;
      g.usedBy = nextUsedBy;
      g.usedCount = nextUsedBy.length;
      g.userIdUsed = nextUsedBy.length >= maxUses ? String(chat) : null;
      g.useTime = useTime;

      writeJson(giftJsonFile, gList);
      writeJson(userJsonFile, users);

      const remainUses = Math.max(0, maxUses - nextUsedBy.length);
      const remainText = maxUses > 1 ? `\n🔁 Còn lại: <b>${remainUses}</b> lượt nhập` : "";
      bot1.sendMessage(chat, `🎉 Nhập Giftcode +<b>${g.value.toLocaleString("vi-VN")} xu</b> thành công!${remainText}`, { parse_mode: "HTML" });
      sendMessageToRoom(`👑 player <b>${users[uIdx].name}</b> nhập Giftcode lộc +<b>${g.value.toLocaleString("vi-VN")} xu</b>!`, { parse_mode: "HTML" });
    } catch {}
  });

  bot1.onText(/^\/doidiemvip(?:\s+(\d+))?$/i, (msg, match) => {
    const chat = msg.chat.id;
    if (isBanned(chat)) return;
    if (msg.chat.type !== "private") {
      bot1.sendMessage(chat, "⚠️ Lệnh đổi điểm VIP chỉ dùng trong chat riêng với bot chính.", { parse_mode: "HTML" });
      return;
    }

    try {
      const users = readJson(userJsonFile);
      const idx = users.findIndex((u: any) => String(u.id) === String(chat));
      if (idx === -1) {
        bot1.sendMessage(chat, "❌ Bạn chưa đăng ký tài khoản! Gõ /start để đăng ký.");
        return;
      }

      const user = users[idx];
      user.vipPoints = Math.max(0, Number(user.vipPoints || 0));
      const vipInfo = getVipTierInfo(user);
      const rate = getVipExchangeRate(user);

      if (!match?.[1]) {
        bot1.sendMessage(chat,
          `${formatVipGuideMessage(user)}\n\n` +
          `👉 <b>Ví dụ đổi điểm:</b> <code>/doidiemvip 10</code>\n` +
          `💸 <b>Tỷ lệ hiện tại của bạn:</b> <b>${rate.toLocaleString("vi-VN")}đ</b>/1 điểm VIP`,
          { parse_mode: "HTML" }
        );
        return;
      }

      const redeemPoints = parseInt(match[1], 10);
      if (isNaN(redeemPoints) || redeemPoints <= 0) {
        bot1.sendMessage(chat, `⚠️ <b>Sai cú pháp!</b>\nDùng: <code>/doidiemvip [số điểm]</code>`, { parse_mode: "HTML" });
        return;
      }

      if (vipInfo.level <= 0 || rate <= 0) {
        bot1.sendMessage(chat, `⚠️ <b>Bạn chưa đủ cấp VIP để đổi điểm.</b>\nHiện tại cần đạt tối thiểu <b>VIP 1</b>.`, { parse_mode: "HTML" });
        return;
      }

      if (user.vipPoints < redeemPoints) {
        bot1.sendMessage(chat, `⚠️ <b>Điểm VIP không đủ!</b>\nBạn đang có: <b>${user.vipPoints.toLocaleString("vi-VN")}</b> điểm.\nDùng: <code>/doidiemvip [số điểm]</code>`, { parse_mode: "HTML" });
        return;
      }

      const receiveAmount = redeemPoints * rate;
      user.vipPoints -= redeemPoints;
      user.sd = (user.sd || 0) + receiveAmount;
      if (user.money !== undefined) user.money = (user.money || 0) + receiveAmount;
      writeJson(userJsonFile, users);

      bot1.sendMessage(chat,
        `🎁 <b>ĐỔI ĐIỂM VIP THÀNH CÔNG!</b>\n` +
        `👑 Cấp hiện tại: <b>VIP${vipInfo.level} ${vipInfo.badge} (${vipInfo.name})</b>\n` +
        `🧮 Số điểm đã đổi: <b>${redeemPoints.toLocaleString("vi-VN")}</b>\n` +
        `💸 Tỷ lệ áp dụng: <b>${rate.toLocaleString("vi-VN")}đ</b>/1 điểm VIP\n` +
        `💰 Số xu nhận được: <b>${receiveAmount.toLocaleString("vi-VN")} xu</b>\n` +
        `🖐️ Điểm VIP còn lại: <b>${user.vipPoints.toLocaleString("vi-VN")}</b>\n` +
        `🏦 Số dư hiện tại: <b>${(user.sd !== undefined ? user.sd : (user.money || 0)).toLocaleString("vi-VN")} xu</b>`,
        { parse_mode: "HTML" }
      );
    } catch {}
  });

  bot1.onText(/^\/muacode\s+(\d+)(?:\s+(\d+))?$/, (msg, match) => {
    const chat = msg.chat.id;
    const userId = msg.from?.id;
    if (!userId || isBanned(userId) || !match) return;

    let quantity = 1;
    let value = 0;

    if (match[2]) {
      quantity = parseInt(match[1], 10);
      value = parseInt(match[2], 10);
    } else {
      quantity = 1;
      value = parseInt(match[1], 10);
    }

    if (isNaN(quantity) || quantity <= 0 || quantity > 100) {
      bot1.sendMessage(chat, "❌ Số lượng giftcode không hợp lệ (từ 1 đến 100).");
      return;
    }
    if (isNaN(value) || value < 1000) {
      bot1.sendMessage(chat, "❌ Mệnh giá giftcode tối thiểu 1.000 xu!");
      return;
    }

    try {
      const users = readJson(userJsonFile);
      const uIdx = users.findIndex((u: any) => String(u.id) === String(userId));
      if (uIdx === -1) {
        bot1.sendMessage(chat, "❌ Bạn chưa đăng ký tài khoản! Gõ /start để đăng ký.");
        return;
      }
      const user = users[uIdx];

      if (!isNoviceUnlocked(user)) {
        bot1.sendMessage(chat, `❌ Bạn phải mở khóa tân thủ trước mới mua được giftcode. Cần nạp đủ <b>20.000 xu</b>.`, { parse_mode: "HTML" });
        return;
      }

      const balance = user.sd !== undefined ? user.sd : (user.money || 0);
      const totalValue = value * quantity;
      const totalCost = Math.ceil(totalValue * 1.03); // 3% fee directly calculated!

      if (balance < totalCost) {
        bot1.sendMessage(chat, `❌ Số dư không đủ! Bạn cần <b>${totalCost.toLocaleString("vi-VN")} xu</b> (Mệnh giá: ${totalValue.toLocaleString("vi-VN")} xu + 3% phí là ${(totalCost - totalValue).toLocaleString("vi-VN")} xu) nhưng hiện tại chỉ có <b>${Math.floor(balance).toLocaleString("vi-VN")} xu</b>.`, { parse_mode: "HTML" });
        return;
      }

      user.sd = balance - totalCost;
      if (user.money !== undefined) user.money = user.money - totalCost;

      const giftcodes = readJson(giftJsonFile);
      const newCodes: any[] = [];
      const codeStrings: string[] = [];

      for (let i = 0; i < quantity; i++) {
        const generatedCode = generateGiftCode();
        newCodes.push(createGiftcodeData(generatedCode, value, String(userId), 1, new Date().toLocaleString("vi-VN")));
        codeStrings.push(`🔑 Gói: <b>${value.toLocaleString("vi-VN")}</b> xu 👉 Code: <code>/code ${generatedCode}</code>`);
      }

      writeJson(giftJsonFile, [...giftcodes, ...newCodes]);
      writeJson(userJsonFile, users);

      const replyMsg = `🎟️ <b>MUA GIFTCODE THÀNH CÔNG!</b>\n💎 Số lượng: <b>${quantity} mã</b>\n💰 Tổng ví trừ (gồm 3% phí): <b>${totalCost.toLocaleString("vi-VN")} xu</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${codeStrings.join("\n")}`;
      bot1.sendMessage(chat, replyMsg, { parse_mode: "HTML" });
      sendMessageToRoom(`👥 <b>Người chơi ẩn danh</b> đã mua thành công <b>${quantity}</b> giftcode mệnh giá <b>${value.toLocaleString("vi-VN")} xu</b>!`, { parse_mode: "HTML" });
    } catch (e) {
      console.error(e);
      bot1.sendMessage(chat, "❌ Có lỗi xảy ra trong quá trình mua giftcode.");
    }
  });

  bot1.onText(/^\/lamcai\s+(\d+)$/, (msg, match) => {
    const chat = msg.chat.id;
    if (!match || !match[1] || !msg.from) return;
    const amount = parseInt(match[1], 10);
    if (isNaN(amount) || amount < 1000000 || amount > 5000000) {
      bot1.sendMessage(chat, "❌ Cú pháp làm cái từ 1.000.000 - 5.000.000!");
      return;
    }
    if (!waitingCai.value) {
      bot1.sendMessage(chat, "❌ Ngoài thời gian đăng ký làm cái!");
      return;
    }
    if (currentCai.value) {
      bot1.sendMessage(chat, "⚠️ Đã có người làm cái phiên này!");
      return;
    }

    const users = readJson(userJsonFile);
    const idx = users.findIndex(u => String(u.id) === String(msg.from!.id));
    
    let user: any = null;
    let balance = 0;
    if (idx !== -1) {
      user = users[idx];
      balance = user.sd !== undefined ? user.sd : (user.money || 0);
    }

    if (!user || balance < amount) {
      bot1.sendMessage(chat, "❌ Sd của bạn k đủ", { reply_to_message_id: msg.message_id });
      return;
    }

    if (user.sd !== undefined) user.sd -= amount;
    if (user.money !== undefined) user.money -= amount;

    currentCai.value = {
      id: String(user.id),
      name: user.name || msg.from.first_name,
      amount,
      pool: amount,
      time: Date.now()
    };

    writeJson(userJsonFile, users);
    waitingCai.value = false;
    state.phienAnnounced = true;

    // Chỉ thông báo làm cái, còn "xin mời đặt cược" sẽ hiện sau khi hết 20s làm cái
    sendMessageToRoom(
      `👑 <b>ĐÃ CÓ NGƯỜI LÀM CÁI PHIÊN MỚI!</b>\n` +
      `🎰 Chủ cái: <b>${currentCai.value.name}</b>\n` +
      `💰 Mức vốn cái: <b>${amount.toLocaleString("vi-VN")} xu</b>\n` +
      `⏳ Vui lòng chờ hết <b>20 giây</b> làm cái để mở cược.`,
      { parse_mode: "HTML" }
    );
  });

  bot1.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
    const chat = msg.chat.id;
    if (msg.chat.type !== "private" || isBanned(chat)) return;
    const name = msg.from?.first_name || "Hảo Hán";
    const startParam = String(match?.[1] || "").trim();
    const referredById = startParam.startsWith("ref_") ? startParam.replace("ref_", "").trim() : "";
    const users = readJson(userJsonFile);
    let u = users.find((x: any) => String(x.id) === String(chat));
    let shouldSaveUsers = false;
    if (!u) {
      u = {
        id: String(chat),
        name,
        sd: 1000,
        cuoc: 0,
        thang: 0,
        thua: 0,
        nap: 0,
        rut: 0,
        dkrut: 0,
        hh: 0,
        lastBetResetDate: moment().tz("Asia/Ho_Chi_Minh").format("YYYY/MM/DD"),
        lastBetWeekId: moment().tz("Asia/Ho_Chi_Minh").format("YYYY-W"),
        cuocHomNay: 0,
        cuocTuanNay: 0,
        currentWinStreak: 0,
        currentLossStreak: 0,
        bestWinStreakToday: 0,
        bestLossStreakToday: 0,
        lastStreakPhien: 0,
        lastStreakResetDate: moment().tz("Asia/Ho_Chi_Minh").format("YYYY/MM/DD"),
        vipPoints: 0,
        vipPointCooldown: 0,
      };
      if (referredById && referredById !== String(chat)) {
        u.referrerId = referredById;
      }
      users.push(u);
      shouldSaveUsers = true;
    } else if (!u.referrerId && referredById && referredById !== String(chat)) {
      u.referrerId = referredById;
      shouldSaveUsers = true;
    }
    if (shouldSaveUsers) {
      writeJson(userJsonFile, users);
    }
    sendWelcomeStartMessage(chat);
  });
}

// --- EXPRESS WEB SERVER RUNTIME ---
async function bootstrap() {
  initJsonFiles();
  registerAllBotCommands();
  setInterval(tickGameLoop, 1000);
  maybeDispatchRandomHourlyGiftCode();
  setInterval(maybeDispatchRandomHourlyGiftCode, 15000);

  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

  app.get("/api/health", (req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      gamePhase: state.gamePhase,
      secondsLeft: state.secondsLeft,
      phien: state.phien,
    });
  });

  app.get("/api/status", (req, res) => {
    const list = readJson(userJsonFile);
    const hu = readJson("hu.json");
    const gifts = readJson(giftJsonFile);
    const banned = readJson(banJsonFile);
    const cau = readJson("cau.json");
    const chanle = readJson("chanle.json");
    const soloRooms = readSoloRooms();

    res.json({
      status: "healthy",
      gamePhase: state.gamePhase,
      secondsLeft: state.secondsLeft,
      phien: state.phien,
      totals: {
        totalBetT: state.totalBetT,
        totalBetX: state.totalBetX,
        totalBetC: state.totalBetC,
        totalBetL: state.totalBetL,
        totalBetTC: state.totalBetTC,
        totalBetTL: state.totalBetTL,
        totalBetXC: state.totalBetXC,
        totalBetXL: state.totalBetXL,
      },
      betsLog: state.betsLog,
      cau,
      chanle,
      usersCount: list.length,
      users: list.map((u: any) => ({
        id: u.id,
        name: u.name,
        sd: u.sd !== undefined ? u.sd : (u.money || 0),
        vip: getVipLevel(u),
        vipPoints: getVipPoints(u),
        nap: u.nap || 0,
        rut: u.rut || 0,
        cuocHomNay: u.cuocHomNay || 0,
        cuocTuanNay: u.cuocTuanNay || 0,
        currentWinStreak: getUserActiveStreakCounts(u).win,
        currentLossStreak: getUserActiveStreakCounts(u).loss,
        streakStatus: getUserStreakStatusText(u),
        banned: banned.some((b: any) => String(b.id) === String(u.id)),
        depositHistory: u.depositHistory || [],
        withdrawHistory: u.withdrawHistory || [],
      })),
      giftcodes: gifts,
      soloRooms: {
        open: getOpenSoloRooms(soloRooms),
        total: soloRooms.length,
      },
      hu: {
        pot: hu.pot || 10000,
        history: hu.history || [],
        forceNextPotExplosion: state.forceNextPotExplosion,
        autoPotRate: state.autoPotRate,
        lessBetWinsRate: state.lessBetWinsRate,
      },
      botsStatus: [
        { name: "Bot 1 (Chính)", tag: "Dragon [BotChinh]", username: botUsernames[0], active: isTokenValid(tokenBot1), error: botErrors[0], token: tokenBot1 },
        { name: "Bot 2 (Phụ 1)", tag: "Dragon Room phụ 1", username: botUsernames[1], active: isTokenValid(tokenBot2), error: botErrors[1], token: tokenBot2 },
        { name: "Bot 3 (Phụ 2)", tag: "Dragon Room phụ 2", username: botUsernames[2], active: isTokenValid(tokenBot3), error: botErrors[2], token: tokenBot3 },
        { name: "Bot 4 (Phụ 3)", tag: "Dragon Room phụ 3", username: botUsernames[3], active: isTokenValid(tokenBot4), error: botErrors[3], token: tokenBot4 },
        { name: "Bot 5 (Phụ 4)", tag: "Dragon Room phụ 4", username: botUsernames[4], active: isTokenValid(tokenBot5), error: botErrors[4], token: tokenBot5 },
      ]
    });
  });

  app.post("/api/config/pot", (req, res) => {
    const { pot, forceNextRound, autoPotRate, lessBetWinsRate } = req.body;
    let huData = readJson("hu.json", '{"pot": 10000, "history": []}');
    if (typeof pot === "number") huData.pot = pot;
    if (typeof forceNextRound === "boolean") state.forceNextPotExplosion = forceNextRound;
    if (typeof autoPotRate === "number") {
      state.autoPotRate = Math.max(0, Math.min(100, autoPotRate));
      huData.autoPotRate = state.autoPotRate;
    }
    if (typeof lessBetWinsRate === "number") {
      state.lessBetWinsRate = Math.max(0, Math.min(100, lessBetWinsRate));
      huData.lessBetWinsRate = state.lessBetWinsRate;
    }
    writeJson("hu.json", huData);
    res.json({ success: true, config: huData });
  });

  app.post("/api/giftcodes/generate", (req, res) => {
    const { count, amount } = req.body;
    if (!count || !amount || count <= 0 || amount <= 0) return res.status(400).json({ success: false });
    const current = readJson(giftJsonFile);
    const generated: any[] = [];
    for (let i = 0; i < count; i++) {
      generated.push(createGiftcodeData("GIFT" + generateGiftCode(), amount, "WEB_ADMIN_PANEL", 1, new Date().toLocaleString("vi-VN")));
    }
    writeJson(giftJsonFile, [...current, ...generated]);
    res.json({ success: true, list: generated });
  });

  app.post("/api/players/action", (req, res) => {
    const { id, action, money, reason } = req.body;
    if (!id || !action) return res.status(400).json({ error: "Missing parameters" });

    if (action === "ban" || action === "unban") {
      let banned = readJson(banJsonFile);
      if (action === "ban") {
        if (!banned.some((b: any) => String(b.id) === String(id))) {
          banned.push({ id: parseInt(id, 10), reason: reason || "Web Penalty", time: new Date().toISOString() });
          bot1.sendMessage(id, `⛔ Tài khoản của bạn đã bị tạm dừng!`).catch(() => {});
        }
      } else {
        banned = banned.filter((b: any) => String(b.id) !== String(id));
      }
      writeJson(banJsonFile, banned);
      return res.json({ success: true });
    }

    if (action === "add" || action === "subtract") {
      const users = readJson(userJsonFile);
      const idx = users.findIndex((u: any) => String(u.id) === String(id));
      if (idx === -1) return res.status(404).json({ error: "User not found" });

      const value = parseInt(money, 10);
      if (isNaN(value) || value <= 0) return res.status(400).json({ error: "Invalid amount" });

      if (action === "add") {
        const result = addDepositToUser(users[idx], value);

        if (!users[idx].depositHistory) users[idx].depositHistory = [];
        users[idx].depositHistory.unshift({ time: moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD HH:mm:ss"), amount: value.toLocaleString("vi-VN"), status: "Thành công (Web Admin)" });
        
        let notifyMsg = `💸 Bạn được cộng nạp từ Admin: +<b>${value.toLocaleString("vi-VN")} xu</b>.\n`;
        if (result.baseResetOccurred) {
          notifyMsg += `⚠️ <b>Lưu ý:</b> Tài khoản chưa mở khóa tân thủ nên số dư trước đó của bạn đã bị reset về <code>0 xu</code>.\n`;
        }
        if (result.newlyUnlocked) {
          notifyMsg += `🎉 <b>Chúc mừng! Bạn đã mở khóa thành viên Tân Thủ thành công</b> (Tổng nạp đạt ${result.totalNapAfter.toLocaleString("vi-VN")}/20.000 xu).\n`;
        } else if (result.totalNapAfter < 20000) {
          notifyMsg += `🔒 <b>Trạng thái:</b> Chưa mở khóa Tân Thủ (${result.totalNapAfter.toLocaleString("vi-VN")}/20.000 xu).\n`;
        }
        notifyMsg += `🔄 Bạn cần thực hiện cược thêm <b>${value.toLocaleString("vi-VN")} xu</b> (vòng cược x1) trước khi có thể thực hiện rút tiền!`;

        bot1.sendMessage(id, notifyMsg, { parse_mode: "HTML" }).catch(() => {});
      } else {
        users[idx].sd = Math.max(0, (users[idx].sd || 0) - value);
        if (users[idx].money !== undefined) users[idx].money = Math.max(0, (users[idx].money || 0) - value);
      }
      writeJson(userJsonFile, users);
      return res.json({ success: true, balance: users[idx].sd });
    }
  });

  app.post("/api/withdrawals/action", (req, res) => {
    const { id, amount, action, reason } = req.body;
    const users = readJson(userJsonFile);
    const idx = users.findIndex((u: any) => String(u.id) === String(id));
    if (idx === -1) return res.status(404).json({ error: "User not found" });
    const u = users[idx];
    const money = parseInt(amount, 10);

    let pinMsgId: number | undefined;
    let refundAmount = money;
    let bankName = "Ngân hàng";
    if (u.withdrawHistory) {
      const item = u.withdrawHistory.find((h: any) => h.status === "Đang xử lý" && String(h.amount) === String(money));
      if (item) {
        item.status = action === "approve" ? "Thành công" : `Từ chối: ${reason || "Hủy"}`;
        pinMsgId = item.adminMessageId;
        const fee = item.fee || 0;
        refundAmount = money + fee;
        bankName = item.bankName || "Ngân hàng";
      }
    }

    if (action === "reject") {
      u.sd = (u.sd || 0) + refundAmount;
      if (u.money !== undefined) u.money = (u.money || 0) + refundAmount;
      bot1.sendMessage(id, `❌ Đơn rút xu trị giá ${money.toLocaleString("vi-VN")} xu đã bị từ chối! Hoàn xu vào ví.`).catch(() => {});
    } else {
      bot1.sendMessage(id, `✅ Yêu cầu rút xu trị giá ${money.toLocaleString("vi-VN")} xu đã được duyệt chuyển khoản thành công!`).catch(() => {});
      sendMessageToRoom(`<b>🤩 Rút Xu Thành Công - ID ${formatMaskedId(u.id)}: +${money.toLocaleString("vi-VN")} xu về ${bankName}</b>`, { parse_mode: "HTML" });
    }

    writeJson(userJsonFile, users);
    if (pinMsgId) unpinFromAdminGroup(pinMsgId);
    res.json({ success: true });
  });

  app.get("/api/download", (req, res) => {
    try {
      const zip = new AdmZip();
      const files = fs.readdirSync(process.cwd());
      for (const file of files) {
        if (["node_modules", ".git", ".next", "dist", "package-lock.json", "Source.zip"].includes(file)) continue;
        const s = fs.statSync(path.join(process.cwd(), file));
        if (s.isDirectory()) zip.addLocalFolder(path.join(process.cwd(), file), file);
        else zip.addLocalFile(path.join(process.cwd(), file));
      }
      const zipPath = path.join(process.cwd(), "Source.zip");
      zip.writeZip(zipPath);
      res.download(zipPath, "LuckyBank_Source.zip");
    } catch (e: any) {
      res.status(500).send("Zipping failed: " + e.message);
    }
  });

  const distPath = path.join(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
      app.use(vite.middlewares);
    } catch {}
  }

  app.listen(3000, "0.0.0.0", () => {
    console.log("🚀 Server running on port 3000");
  });
}

bootstrap();
