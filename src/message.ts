import { room, PlayerAugmented } from "../index";
import { blendColorsInt } from "./utils";
import { getRankName, getRankColor } from "./elo";

const percentage = (elo: number) => 1 / (1 + Math.E ** -((elo - 1200) / 100));

export const sendMessage = (
  msg: string,
  p?: PlayerAugmented | PlayerObject | null,
) => {
  // Filter out unwanted messages about open source or Discord
  if (msg.includes("github.com/jakjus/jjrs") || 
      msg.includes("discord.gg") || 
      msg.includes("Open Source")) {
    return; // Skip sending these messages
  }
  
  if (p) {
    room.sendAnnouncement(`[DM] ${msg}`, p.id, 0xd6cedb, "small", 2);
  } else {
    room.sendAnnouncement(`[Server] ${msg}`, undefined, 0xd6cedb, "small", 0);
  }
};

export const playerMessage = async (p: PlayerAugmented, msg: string) => {
  if (p.afk) {
    sendMessage(`You are AFK. Write "!back" to come back.`, p);
  }
  const card = p.cardsAnnounced < 1 ? `` : p.cardsAnnounced < 2 ? `🟨 ` : `🟥 `;
  const rank = getRankName(p.elo);
  const rankColor = getRankColor(p.elo);
  room.sendAnnouncement(
    `[${rank}] [${p.elo}] ${card}${p.name}: ${msg}`,
    undefined,
    parseInt(rankColor.replace('#', ''), 16),
    "normal",
    1,
  );
};
