import { room, players, PlayerAugmented, db } from "..";
import * as fs from "fs";
import { performDraft } from "./draft/draft";
import { sendMessage } from "./message";
import { game, Game } from "..";
import { sleep } from "./utils";
import { toAug } from "..";
import { teamSize } from "./settings";
import { changeElo } from "./elo";

/* This manages teams and players depending
 * on being during ranked game or draft phase. */

const maxTeamSize = process.env.DEBUG ? 1 : teamSize;
let isRunning: boolean = false;
let isRanked: boolean = false;
export let duringDraft: boolean = false;
export let changeDuringDraft = (m: boolean) => (duringDraft = m);

const balanceTeams = () => {
  if (duringDraft || isRanked) {
    return;
  }
  // To be used only during unranked
  if (red().length > blue().length + 1) {
    room.setPlayerTeam(red()[0].id, 2);
  } else if (red().length + 1 < blue().length) {
    room.setPlayerTeam(blue()[0].id, 1);
  }
};

export const handlePlayerLeaveOrAFK = async () => {
  if (players.filter((p) => !p.afk).length < 1) {
    room.stopGame();
    sleep(5000); // this is important to cancel all ongoing animations when match stops
    room.startGame();
  }
  await sleep(100);
  if (!duringDraft && !isRanked) {
    balanceTeams();
  }
  if (isRanked && !process.env.DEBUG) {
    if ([...red(), ...blue()].length <= 2) {
      isRanked = false;
      sendMessage("Only 2 players left. Cancelling ranked game.");
    }
  }
};

const handleWin = async (game: Game, winnerTeamId: TeamID) => {

  try {
    const changes = await changeElo(game, winnerTeamId)

    changes.forEach((co) => {
      const p = room.getPlayer(co.id);
      if (p) {
        sendMessage(
          `Your ELO: ${toAug(p).elo} → ${toAug(p).elo + co.change} (${co.change > 0 ? "+" : ""}${co.change})`,
          p,
        );
      }
    });

    changes.forEach((co) => {
      if (players.map((p) => p.id).includes(co.id)) {
        const pp = room.getPlayer(co.id);
        if (pp) {
          toAug(pp).elo += co.change;
        } // change elo on server just for showing in chat. when running two instances of the server, this may be not accurate, although it is always accurate in DB (because the changes and calculations are always based on DB data, not on in game elo. false elo will be corrected on reconnect.)
      }
    });
  } catch (e) {
    console.log("Error during handling ELO:", e);
  }
};
const red = () => room.getPlayerList().filter((p) => p.team == 1);
const blue = () => room.getPlayerList().filter((p) => p.team == 2);
const spec = () => room.getPlayerList().filter((p) => p.team == 0);
const both = () =>
  room.getPlayerList().filter((p) => p.team == 1 || p.team == 2);
const ready = () => room.getPlayerList().filter((p) => !toAug(p).afk);

export const addToGame = (room: RoomObject, p: PlayerObject) => {
  if (game && isRanked && [...red(), ...blue()].length <= maxTeamSize * 2) {
    return;
  }
  if (game && (toAug(p).cardsAnnounced >= 2 || toAug(p).foulsMeter >= 2)) {
    return;
  }
  if (duringDraft) {
    return;
  }
  if (red().length > blue().length) {
    room.setPlayerTeam(p.id, 2);
  } else {
    room.setPlayerTeam(p.id, 1);
  }
};

const initChooser = (room: RoomObject) => {
  const refill = () => {
    const specs = spec().filter((p) => !toAug(p).afk);
    for (let i = 0; i < specs.length; i++) {
      const toTeam = i % 2 == 0 ? 1 : 2;
      room.setPlayerTeam(specs[i].id, toTeam);
    }
  };

  const isEnoughPlayers = () => ready().length >= maxTeamSize * 2;

  if (room.getScores()) {
    isRunning = true;
  }

  const _onTeamGoal = room.onTeamGoal;
  room.onTeamGoal = (team) => {
    if (game) {
      game.inPlay = false;
      game.animation = true;
      game.boostCount = 0;
      game.ballRotation.power = 0;
      game.positionsDuringPass = [];
      players.forEach((p) => (p.canCallFoulUntil = 0));
      game.eventCounter += 1;
      // --- Goal Celebration ---
      const teamName = team === 1 ? "Red" : "Blue";
      const teamEmoji = team === 1 ? "🔴" : "🔵";
      room.sendAnnouncement(`🎉 GOAL for ${teamName} Team! ${teamEmoji} 🎉`, undefined, team === 1 ? 0xd10000 : 0x0700d1, "bold", 2);
      // Confetti/emoji spam effect
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          room.sendAnnouncement(`${teamEmoji.repeat(10)} CELEBRATION! ${teamEmoji.repeat(10)}`, undefined, team === 1 ? 0xd10000 : 0x0700d1, "normal", 0);
        }, 500 + i * 300);
      }
      // --- End Goal Celebration ---
      if (isRanked && !duringDraft) {
        const evC = game.eventCounter;
        const gameId = game.id;
        const dirKick = team == 1 ? -1 : 1;
        setTimeout(() => {
          if (
            room.getBallPosition()?.x == 0 &&
            room.getBallPosition()?.y == 0 &&
            game?.eventCounter == evC &&
            game?.id == gameId
          ) {
            room.setDiscProperties(0, {
              xspeed: dirKick * 2,
              yspeed: Math.random(),
            });
            sendMessage(
              "Ball was not touched for 35 seconds, therefore it is moved automatically.",
            );
          }
        }, 35000);
      }
    }
    _onTeamGoal(team);
  };

  const _onTeamVictory = room.onTeamVictory;
  room.onTeamVictory = async (scores) => {
    if (duringDraft) {
      return;
    }
    if (_onTeamVictory) {
      _onTeamVictory(scores);
    }
    const winTeam = scores.red > scores.blue ? 1 : 2;
    const loseTeam = scores.red > scores.blue ? 2 : 1;
    if (isRanked) {
      if (!game) {
        return;
      }
      await handleWin(game, winTeam);
    }
    sendMessage("Break time: 10 seconds.");
    await sleep(10000);
    const winnerIds = room
      .getPlayerList()
      .filter((p) => p.team == winTeam)
      .map((p) => p.id);
    if (ready().length >= maxTeamSize * 2) {
      const rd = ready();
      duringDraft = true;
      room.getPlayerList().forEach((p) => room.setPlayerAvatar(p.id, ""));
      const readyAndSorted = rd.sort((a, b) => toAug(b).elo - toAug(a).elo);
      const draftResult = await performDraft(
        room,
        readyAndSorted,
        maxTeamSize,
        (p: PlayerObject) => (toAug(p).afk = true),
      );
      const rsStadium = fs.readFileSync("./maps/rs5.hbs", {
        encoding: "utf8",
        flag: "r",
      });
      room.setCustomStadium(rsStadium);
      room.getPlayerList().forEach((p) => {
        if (p.team != 0) {
          room.setPlayerTeam(p.id, 0);
        }
      });
      draftResult?.red?.forEach((p) => room.setPlayerTeam(p.id, 1));
      draftResult?.blue?.forEach((p) => room.setPlayerTeam(p.id, 2));
      duringDraft = false;
      if (
        draftResult?.red?.length == maxTeamSize &&
        draftResult?.blue?.length == maxTeamSize
      ) {
        isRanked = true;
        sendMessage("Ranked game.");
      } else {
        sendMessage("Unranked game.");
        isRanked = false;
        refill();
      }
    } else {
      isRanked = false;
      let i = 0;
      ready().forEach((p) => {
        if (i % 2) {
          room.setPlayerTeam(p.id, 2);
        } else {
          room.setPlayerTeam(p.id, 1);
        }
        i++;
      });
    }
    room.startGame();
  };
};

export default initChooser;
