import { sendMessage } from "./message";
import * as fs from "fs";
import { room, PlayerAugmented, version, loggedInUsers } from "../index";
import { addToGame, handlePlayerLeaveOrAFK } from "./chooser";
import { adminPass } from "../index";
import { performDraft } from "./draft/draft";
import { teamSize } from "./settings";
import { changeDuringDraft } from "./chooser";
import config from "../config";

// --- Mute logic for !announce ---
const mutedPlayers = new Set<number>();

// Listen for chat and block muted players
if (typeof room !== 'undefined' && room !== null) {
  room.onPlayerChat = (player, message) => {
    if (mutedPlayers.has(player.id)) {
      sendMessage("You are muted due to an admin announcement.", player);
      return false;
    }
    return true;
  };
}

export const isCommand = (msg: string) => msg.trim().startsWith("!");
export const handleCommand = (p: PlayerAugmented, msg: string) => {
  let commandText = msg.trim().slice(1);
  let commandName = commandText.split(" ")[0];
  let commandArgs = commandText.split(" ").slice(1);
  if (commands[commandName]) {
    commands[commandName](p, commandArgs);
  } else {
    sendMessage("Command not found.", p);
  }
};

type commandFunc = (p: PlayerAugmented, args: Array<string>) => void;
const commands: { [key: string]: commandFunc } = {
  afk: (p) => setAfk(p),
  back: (p) => setBack(p),
  discord: (p) => showDiscord(p),
  dc: (p) => showDiscord(p),
  bb: (p) => bb(p),
  help: (p) => showHelp(p),
  admin: (p, args) => adminLogin(p, args),
  login: (p, args) => loginCommand(p, args),
  draft: (p) => draft(p),
  rs: (p) => rs(p),
  version: (p) => showVersion(p),
  announce: (p, args) => announceCommand(p, args),
  skin: (p, args) => skinCommand(p, args),
};

const adminLogin = (p: PlayerAugmented, args: string[]) => {
  if (args.length < 1) {
    sendMessage("Usage: !admin your_admin_pass", p);
    return;
  }
  if (args[0] === adminPass) {
    room.setPlayerAdmin(p.id, true);
    sendMessage("Login successful.", p);
  } else {
    sendMessage("Wrong password.", p);
  }
};

const loginCommand = (p: PlayerAugmented, args: string[]) => {
  if (args.length < 1) {
    sendMessage("Usage: !login your_code", p);
    return;
  }
  
  const loginCode = "5820";
  
  if (args[0] === loginCode) {
    // Set player as admin
    room.setPlayerAdmin(p.id, true);
    
    // Remember this user has used the login command (add to array if not already there)
    if (!loggedInUsers.includes(p.auth)) {
      loggedInUsers.push(p.auth);
    }
    
    sendMessage("Login successful. You are now an admin.", p);
  } else {
    sendMessage("Invalid login code.", p);
  }
};

const draft = async (p: PlayerAugmented) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage(
      "❌ ADMIN only command. If you're an admin, log in with !admin",
      p,
    );
    return;
  }
  sendMessage(`${p.name} has changed map to jakjus Draft`);
  changeDuringDraft(true);
  const result = await performDraft(room, room.getPlayerList(), teamSize);
  room.getPlayerList().forEach((p) => {
    if (p.team != 0) {
      room.setPlayerTeam(p.id, 0);
    }
  });
  result?.red?.forEach((p) => room.setPlayerTeam(p.id, 1));
  result?.blue?.forEach((p) => room.setPlayerTeam(p.id, 2));
  changeDuringDraft(false);
};

const rs = (p: PlayerAugmented) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage(
      "❌ ADMIN only command. If you're an admin, log in with !admin",
      p,
    );
    return;
  }
  room.stopGame();
  const rsStadium = fs.readFileSync("./maps/rs5.hbs", {
    encoding: "utf8",
    flag: "r",
  });
  room.setCustomStadium(rsStadium);
  sendMessage(`${p.name} has changed map to JJRS`);
};

const setAfk = (p: PlayerAugmented) => {
  p.afk = true;
  room.setPlayerTeam(p.id, 0);
  sendMessage("You are now AFK.", p);
  handlePlayerLeaveOrAFK();
};

const setBack = (p: PlayerAugmented) => {
  if (!p.afk) {
    sendMessage("You are ALREADY back.", p);
    return;
  }
  p.afk = false;
  addToGame(room, room.getPlayer(p.id));
  sendMessage("You are BACK.", p);
};

const showHelp = (p: PlayerAugmented) => {
  sendMessage(
    `${config.roomName}. Commands: ${Object.keys(commands)
      .map((k) => "!" + k)
      .join(", ")}`,
    p,
  );
};

const showDiscord = (p: PlayerAugmented) => {
  sendMessage(`Discord feature is currently disabled.`, p);
};

const bb = (p: PlayerAugmented) => {
  room.kickPlayer(
    p.id,
    "Bye!",
    false,
  );
};

const showVersion = (p: PlayerAugmented) => {
  sendMessage(`v${version}`, p);
};

// --- Announce Command ---
const announceCommand = (p: PlayerAugmented, args: string[]) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ ADMIN only command.", p);
    return;
  }
  if (args.length < 1) {
    sendMessage("Usage: !announce your_message_here", p);
    return;
  }
  const msg = args.join(" ");
  // Mute all non-admins
  room.getPlayerList().forEach(player => {
    if (!room.getPlayer(player.id).admin) {
      mutedPlayers.add(player.id);
    }
  });
  // Send bold gold message
  room.sendAnnouncement(`**[ANNOUNCEMENT]** ${msg}`, undefined, 0xFFD700, "bold", 2);
  // Unmute after 30 seconds
  setTimeout(() => {
    mutedPlayers.clear();
    room.sendAnnouncement("Players are now unmuted.", undefined, 0xFFD700, "normal", 0);
  }, 30000);
};

// --- World Cup Skins ---
const worldCupSkins = {
  germany: { flag: "🇩🇪", color: 0x000000 },
  france: { flag: "🇫🇷", color: 0x0055A4 },
  brazil: { flag: "🇧🇷", color: 0x009C3B },
  argentina: { flag: "🇦🇷", color: 0x74ACDF },
  spain: { flag: "🇪🇸", color: 0xAA151B },
  england: { flag: "🏴", color: 0xFFFFFF },
  italy: { flag: "🇮🇹", color: 0x008C45 },
  portugal: { flag: "🇵🇹", color: 0x006600 },
  netherlands: { flag: "🇳🇱", color: 0x21468B },
  morocco: { flag: "🇲🇦", color: 0xC1272D },
  usa: { flag: "🇺🇸", color: 0x3C3B6E },
  saudi: { flag: "🇸🇦", color: 0x006C35 },
  japan: { flag: "🇯🇵", color: 0xFFFFFF },
  croatia: { flag: "🇭🇷", color: 0xFF0000 },
  uruguay: { flag: "🇺🇾", color: 0x1EBBD7 },
};

const skinCommand = (p, args) => {
  if (args.length === 1) {
    // Player chooses their own skin
    const countryArg = args[0].toLowerCase();
    if (!worldCupSkins[countryArg]) {
      sendMessage("Unknown country. Available: " + Object.keys(worldCupSkins).join(", "), p);
      return;
    }
    const skin = worldCupSkins[countryArg];
    room.setPlayerAvatar(p.id, skin.flag);
    room.setPlayerDiscProperties(p.id, { color: skin.color });
    sendMessage(`You have chosen the ${countryArg.toUpperCase()} skin!`, p);
    return;
  }
  if (args.length === 2) {
    // Admin sets for a team
    if (!room.getPlayer(p.id).admin) {
      sendMessage("❌ ADMIN only command.", p);
      return;
    }
    const teamArg = args[0].toLowerCase();
    const countryArg = args[1].toLowerCase();
    if (!['red', 'blue'].includes(teamArg)) {
      sendMessage("Team must be 'red' or 'blue'", p);
      return;
    }
    if (!worldCupSkins[countryArg]) {
      sendMessage("Unknown country. Available: " + Object.keys(worldCupSkins).join(", "), p);
      return;
    }
    const teamId = teamArg === 'red' ? 1 : 2;
    const skin = worldCupSkins[countryArg];
    room.getPlayerList().forEach(player => {
      if (player.team === teamId) {
        room.setPlayerAvatar(player.id, skin.flag);
        room.setPlayerDiscProperties(player.id, { color: skin.color });
      }
    });
    sendMessage(`Applied ${countryArg.toUpperCase()} skin to ${teamArg} team!`, p);
    return;
  }
  sendMessage("Usage: !skin country  OR  !skin red|blue country", p);
};
