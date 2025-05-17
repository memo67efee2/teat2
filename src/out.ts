import { room, Game, toAug } from "../index";
import {
  mapBounds,
  goals,
  defaults,
  colors,
  secondBallId,
  thirdBallId,
} from "./settings";
import { sleep } from "./utils";
import { announceCards } from "./foul";
import { penaltyPoint } from "./settings";
import { resetTeamplayBoost, setBallInvMassAndColor } from "./teamplayBoost";

const blink = async (
  game: Game,
  savedEventCounter: number,
  forTeam: TeamID,
) => {
  for (let i = 0; i < 140; i++) {
    if (!room.getScores()) {
      return;
    }
    // Cancel blink if there is another out
    if (game.inPlay || savedEventCounter != game.eventCounter) {
      //room.setDiscProperties(0, { color: colors.white });
      return true;
    }
    const blinkColor = forTeam == 1 ? colors.red : colors.blue;
    if (i > 115) {
      if (Math.floor(i / 2) % 2 == 0) {
        room.setDiscProperties(0, { color: blinkColor });
      } else {
        room.setDiscProperties(0, { color: colors.white });
      }
    }
    await sleep(100);
  }
  //room.setDiscProperties(0, { color: colors.white });
};

export const handleBallOutOfBounds = (game: Game) => {
  if (!game.inPlay || game.animation) {
    return;
  }
  const ball = room.getDiscProperties(0);
  const lastTouchTeamId = game.lastTouch?.byPlayer.team;
  // LEFT and RIGHT BORDER, but not in GOAL
  if (Math.abs(ball.x) > mapBounds.x && Math.abs(ball.y) > goals.y) {
    throwFakeBall(ball);
    if (ball.x < 0) {
      // LEFT BORDER
      if (lastTouchTeamId == 1) {
        cornerKick(game, 2, ball);
      } else if (lastTouchTeamId == 2) {
        goalKick(game, 1, ball);
      }
    } else {
      // RIGHT BORDER
      if (lastTouchTeamId == 1) {
        goalKick(game, 2, ball);
      } else if (lastTouchTeamId == 2) {
        cornerKick(game, 1, ball);
      }
    }
  }
  // UPPER and LOWER BORDER
  //if (Math.abs(ball.x) > mapBounds.x && Math.abs(ball.y) > goals.y) {
  else if (Math.abs(ball.y) > mapBounds.y && Math.abs(ball.x) < mapBounds.x) {
    throwFakeBall(ball);
    throwIn(game, lastTouchTeamId == 1 ? 2 : 1, ball);
  }
};

const cornerKick = async (
  game: Game,
  forTeam: TeamID,
  pos: { x: number; y: number },
) => {
  announceCards(game);
  game.eventCounter += 1;
  const savedEventCounter = game.eventCounter;
  throwRealBall(
    game,
    forTeam,
    {
      x: Math.sign(pos.x) * (mapBounds.x - 10),
      y: (mapBounds.y - 20) * Math.sign(pos.y),
    },
    savedEventCounter,
  );
  const blockerId = forTeam == 1 ? 2 : 1;
  const notBlockerId = forTeam == 1 ? 1 : 2;
  room.setDiscProperties(blockerId, {
    x: (mapBounds.x + 60) * Math.sign(pos.x),
    y: (mapBounds.y + 60) * Math.sign(pos.y),
    radius: 420,
  });
  room.setDiscProperties(notBlockerId, { x: 500, y: 1200 });
  room
    .getPlayerList()
    .filter((p) => p.team != 0)
    .forEach((p) => {
      room.setPlayerDiscProperties(p.id, { invMass: 1000000 });
    });

  game.rotateNextKick = true;
  const r = await blink(game, savedEventCounter, forTeam);
  if (r) {
    return;
  }

  clearCornerBlocks();
};

const goalKick = async (
  game: Game,
  forTeam: TeamID,
  pos: { x: number; y: number },
) => {
  announceCards(game);
  game.eventCounter += 1;
  const savedEventCounter = game.eventCounter;
  throwRealBall(
    game,
    forTeam,
    { x: Math.sign(pos.x) * (mapBounds.x - 80), y: 0 },
    savedEventCounter,
  );
  room
    .getPlayerList()
    .filter((p) => p.team != 0)
    .forEach((p) => {
      room.setPlayerDiscProperties(p.id, { invMass: 1000000 });
      if (p.team != forTeam) {
        // Collide with Box' joints
        room.setPlayerDiscProperties(p.id, {
          cGroup:
            room.CollisionFlags.red |
            room.CollisionFlags.blue |
            room.CollisionFlags.c0,
        });
        // Move back from the line
        if (
          Math.sign(pos.x) * p.position.x > 830 &&
          p.position.y > -330 &&
          p.position.y < 330
        ) {
          room.setPlayerDiscProperties(p.id, { x: Math.sign(pos.x) * 825 });
        }
      }
    });

  game.rotateNextKick = true;

  const r = await blink(game, savedEventCounter, forTeam);
  if (r) {
    return;
  }

  clearGoalKickBlocks();
};

const throwIn = async (
  game: Game,
  forTeam: TeamID,
  pos: { x: number; y: number },
) => {
  announceCards(game);
  const currentGameId = game.id;
  game.eventCounter += 1;
  game.skipOffsideCheck = true;
  const savedEventCounter = game.eventCounter;
  throwRealBall(
    game,
    forTeam,
    { x: pos.x, y: Math.sign(pos.y) * mapBounds.y },
    savedEventCounter,
  );
  if (forTeam == 1) {
    if (pos.y < 0) {
      // show top red line
      room.setDiscProperties(17, { x: 1149 });
      // hide top blue line
      room.setDiscProperties(19, { x: -1149 });
    } else {
      // show bottom red line
      room.setDiscProperties(21, { x: 1149 });
      // hide bottom blue line
      room.setDiscProperties(23, { x: -1149 });
    }
  } else {
    if (pos.y < 0) {
      // show top blue line
      room.setDiscProperties(19, { x: 1149 });
      // hide top red line
      room.setDiscProperties(17, { x: -1149 });
    } else {
      // show bottom blue line
      room.setDiscProperties(23, { x: 1149 });
      // hide bottom red line
      room.setDiscProperties(21, { x: -1149 });
    }
  }

  room
    .getPlayerList()
    .filter((p) => p.team != 0)
    .forEach((p) => {
      if (!room.getScores()) {
        return;
      }
      room.setPlayerDiscProperties(p.id, { invMass: 1000000 });
      const defCf =
        p.team == 1 ? room.CollisionFlags.red : room.CollisionFlags.blue;
      if (p.team == forTeam) {
        room.setPlayerDiscProperties(p.id, { cGroup: defCf });
      } else {
        // Collide with Plane
        room.setPlayerDiscProperties(p.id, {
          cGroup:
            room.CollisionFlags.red |
            room.CollisionFlags.blue |
            room.CollisionFlags.c1,
        });
        // Move back from the line
        if (p.position.y < -450 && pos.y < 0) {
          room.setPlayerDiscProperties(p.id, { y: -440 });
        } else if (p.position.y > 450 && pos.y > 0) {
          room.setPlayerDiscProperties(p.id, { y: 440 });
        }
      }
    });

  const r = await blink(game, savedEventCounter, forTeam);
  if (r) {
    return;
  }
  if (!room.getScores()) {
    return;
  } // if no game or next game started
  if (
    game &&
    (game.id != currentGameId || game.eventCounter != savedEventCounter)
  ) {
    return;
  } // if next game started but its still on out
  const newForTeam = forTeam == 1 ? 2 : 1;
  game.animation = true; // when giving out to other team, ball is moved, that can evoke game.inPlay = true and double-activate throwin (new throwin for opposite team and again the same team, as it will detect the ball moving)
  throwIn(game, newForTeam, pos);
};

export const freeKick = async (
  game: Game,
  forTeam: TeamID,
  pos: { x: number; y: number },
) => {
  announceCards(game);
  room.pauseGame(true);
  room.pauseGame(false);
  game.eventCounter += 1;
  const savedEventCounter = game.eventCounter;
  throwRealBall(game, forTeam, pos, savedEventCounter);
  const blockerId = forTeam == 1 ? 2 : 1;
  const notBlockerId = forTeam == 1 ? 1 : 2;
  const defMoveDirection = forTeam == 1 ? 1 : -1;
  room
    .getPlayerList()
    .filter((p) => p.team != forTeam && p.team != 0)
    .forEach((p) => {
      const props = room.getPlayerDiscProperties(p.id);
      room.setPlayerDiscProperties(p.id, {
        x: pos.x + defMoveDirection * (Math.random() * 200 + 50),
      });
    });

  room.setDiscProperties(blockerId, { ...pos, radius: 220 });
  room.setDiscProperties(notBlockerId, { x: 500, y: 1200 });
  room
    .getPlayerList()
    .filter((p) => p.team != 0)
    .forEach((p) => {
      room.setPlayerDiscProperties(p.id, { invMass: 1000000 });
    });
  await sleep(100);
  game.rotateNextKick = true;

  const r = await blink(game, savedEventCounter, forTeam);
  if (r) {
    return;
  }

  clearCornerBlocks();
};

export const handleBallInPlay = async (game: Game) => {
  if (game.animation) {
    return;
  }
  const props = room.getDiscProperties(0);
  if (Math.abs(props.xspeed) > 0.1 || Math.abs(props.yspeed) > 0.1) {
    game.inPlay = true;
    room
      .getPlayerList()
      .forEach((p) =>
        room.setPlayerDiscProperties(p.id, { invMass: defaults.invMass }),
      );
    //room.setDiscProperties(0, { color: colors.white });
    clearThrowInBlocks();
    clearCornerBlocks();
    clearGoalKickBlocks();
  }
};

export const clearThrowInBlocks = () => {
  room
    .getPlayerList()
    .filter((p) => p.team != 0)
    .forEach((p) => {
      if (p.team == 1) {
        room.setPlayerDiscProperties(p.id, { cGroup: room.CollisionFlags.red });
      } else if (p.team == 2) {
        room.setPlayerDiscProperties(p.id, {
          cGroup: room.CollisionFlags.blue,
        });
      }
    });
  room.setDiscProperties(17, { x: -1149 });
  room.setDiscProperties(19, { x: -1149 });
  room.setDiscProperties(21, { x: -1149 });
  room.setDiscProperties(23, { x: -1149 });
};

export const clearCornerBlocks = () => {
  room.setDiscProperties(1, { x: -400, y: 1600 });
  room.setDiscProperties(2, { x: 400, y: 1600 });
};

export const clearGoalKickBlocks = () => {
  room
    .getPlayerList()
    .filter((p) => p.team != 0)
    .forEach((p) => {
      if (p.team == 1) {
        room.setPlayerDiscProperties(p.id, { cGroup: room.CollisionFlags.red });
      } else if (p.team == 2) {
        room.setPlayerDiscProperties(p.id, {
          cGroup: room.CollisionFlags.blue,
        });
      }
    });
};

const throwFakeBall = async (ball: DiscPropertiesObject) => {
  let oldRadius = ball.radius;
  room.setDiscProperties(secondBallId, {
    x: ball.x + ball.xspeed,
    y: ball.y + ball.yspeed,
    xspeed: ball.xspeed,
    yspeed: ball.yspeed,
    radius: oldRadius,
  });
  for (let i = 0; i < 100; i++) {
    if (!room.getScores()) {
      return;
    }
    room.setDiscProperties(secondBallId, { radius: oldRadius });
    if (i > 40) {
      if (oldRadius < 0.4) {
        room.setDiscProperties(secondBallId, { radius: 0 });
        return;
      }
      oldRadius -= 0.4;
    }
    await sleep(30);
  }
};

const throwRealBall = async (
  game: Game,
  forTeam: TeamID,
  toPos: { x: number; y: number },
  evCounter: number,
) => {
  if (game.eventCounter != evCounter) {
    return;
  }
  game.animation = true;
  game.inPlay = false;
  room.getPlayerList().filter(p => p.team != 0).forEach(p => {
    toAug(p).activation = 0  // dont get stuck with superpower on out
  })
  resetTeamplayBoost(game);
  const xPushOutOfSight =
    Math.abs(toPos.x) > mapBounds.x - 5
      ? Math.sign(toPos.x) * (mapBounds.x + 250)
      : toPos.x;
  const yPushOutOfSight =
    Math.abs(toPos.y) > mapBounds.y - 5
      ? Math.sign(toPos.y) * (mapBounds.y + 250)
      : toPos.y;
  game.ballRotation.power = 0;
  room.setDiscProperties(0, {
    radius: 0,
    xspeed: 0,
    yspeed: 0,
    cMask: 0,
    cGroup: room.CollisionFlags.c0,
    xgravity: 0,
    ygravity: 0,
    x: xPushOutOfSight,
    y: yPushOutOfSight,
    invMass: 0.00001,
  });

  const xx = Math.sign(
    Math.max(Math.abs(toPos.x) + 1 - mapBounds.x, 0) * Math.sign(toPos.x),
  );
  const yy = Math.sign(
    Math.max(Math.abs(toPos.y) + 1 - mapBounds.y, 0) * Math.sign(toPos.y),
  );
  const angleOffset = Math.atan2(yy, xx);
  //                       _..._
  //                      /     \
  // angle starting from (<--x   )
  // left direction       \_   _/
  //                        '''

  const dist = 140; // distance from which ball is passed
  const throwStrength = 0.02; // ball pass strength
  const spread = Math.PI / 2; // can be between PI and 0 (0 will throw directly from horizontal or vertical line)
  const angle = (Math.PI - spread) / 2 + Math.random() * spread + angleOffset;
  const throwFromX = Math.sin(angle) * dist + toPos.x;
  const throwFromY = -Math.cos(angle) * dist + toPos.y;
  const throwSpeedX = Math.sin(angle + Math.PI) * dist * throwStrength;
  const throwSpeedY = -Math.cos(angle + Math.PI) * dist * throwStrength;
  //await sleep(Math.random() * 500);
  room.setDiscProperties(thirdBallId, {
    //color: forTeam == 1 ? colors.red : colors.blue,
    x: throwFromX,
    y: throwFromY,
    xspeed: throwSpeedX,
    yspeed: throwSpeedY,
    xgravity: -throwSpeedX*0.004,
    ygravity: -throwSpeedY*0.004,
  });
  for (let i = 0; i < 1000; i++) {
    const thirdBall = room.getDiscProperties(thirdBallId);
    if (!thirdBall) {
      return;
    }
    if (game.eventCounter != evCounter) {
      return;
    }
    const distToDest = Math.sqrt(
      ((thirdBall.x+thirdBall.xspeed*2) - toPos.x) ** 2 + ((thirdBall.y+thirdBall.yspeed*2) - toPos.y) ** 2,
    );
    if (distToDest < 1.2) {
      break;
    }
    await sleep(33.333);  // 2 frames
  }

  // Hide fake ball and replace with real ball
  room.setDiscProperties(thirdBallId, { x: 1000, y: 860, xgravity: 0, ygravity: 0 });
  const toMass = game.rotateNextKick
    ? defaults.ballInvMass + 0.63
    : defaults.ballInvMass;
  room.setDiscProperties(0, {
    x: toPos.x,
    y: toPos.y,
    xgravity: 0,
    ygravity: 0,
    radius: defaults.ballRadius,
    cMask: room.CollisionFlags.all,
    cGroup:
      room.CollisionFlags.ball |
      room.CollisionFlags.kick |
      room.CollisionFlags.score,
    invMass: defaults.ballInvMass,
  });
  game.animation = false;
  // allow fast pass during first second, then set mass for long pass
  await sleep(1000);
  if (evCounter == game.eventCounter && !game.inPlay) {
    room.setDiscProperties(0, { invMass: toMass });
    if (toMass != defaults.ballInvMass) {
      room.setDiscProperties(0, { color: colors.powerball });
    }
  }
};

export const penalty = async (
  game: Game,
  forTeam: TeamID,
  fouledAt: { x: number; y: number },
) => {
  const pos = { x: Math.sign(fouledAt.x) * penaltyPoint.x, y: penaltyPoint.y };
  announceCards(game);
  const oppTeam = forTeam == 1 ? 2 : 1;
  const shooter = room.getPlayerList().filter((p) => p.team == forTeam)[0];
  const gk = room
    .getPlayerList()
    .filter((p) => p.team == oppTeam && toAug(p).foulsMeter < 2)[0];
  game.eventCounter += 1;
  const savedEventCounter = game.eventCounter;
  throwRealBall(game, forTeam, pos, savedEventCounter);
  room
    .getPlayerList()
    .filter((p) => p.team != 0)
    .forEach((p) => {
      room.setPlayerDiscProperties(p.id, {
        invMass: 1000000,
        xspeed: 0,
        yspeed: 0,
      });
    });
  room.pauseGame(true);
  room.pauseGame(false);
  room
    .getPlayerList()
    .filter((p) => p.team != 0 && p.id != gk?.id && p.id != shooter?.id)
    .forEach((p) => {
      // Collide with Box' joints
      room.setPlayerDiscProperties(p.id, {
        cGroup:
          room.CollisionFlags.red |
          room.CollisionFlags.blue |
          room.CollisionFlags.c0,
      });
      // Move back from the line
      if (
        Math.sign(pos.x) * p.position.x > 830 &&
        p.position.y > -330 &&
        p.position.y < 330
      ) {
        room.setPlayerDiscProperties(p.id, { x: Math.sign(pos.x) * 825 });
      }
    });
  if (shooter) {
    room.setPlayerDiscProperties(shooter.id, {
      x: pos.x - Math.sign(pos.x) * 10,
      y: pos.y,
    });
  }
  if (gk) {
    const defCf =
      gk.team == 1 ? room.CollisionFlags.red : room.CollisionFlags.blue;
    const toSet = {
      x: (mapBounds.x + 15) * Math.sign(pos.x),
      y: pos.y,
      cGroup: defCf | room.CollisionFlags.c2,
    };
    room.setPlayerDiscProperties(gk.id, toSet);
  }

  await sleep(100);
  game.rotateNextKick = true;

  const r = await blink(game, savedEventCounter, forTeam);
  if (r) {
    return;
  }
  clearGoalKickBlocks();
};
