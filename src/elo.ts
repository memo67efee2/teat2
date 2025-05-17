import { db, Game } from "..";

const k = 30
const getp1 = (elo: number, enemyTeamElo: number) => 1 / (1 + 10 ** ((elo - enemyTeamElo) / 400));

const getAvgElo = (playerListWithElo: { elo: number }[]): number => {
  if (playerListWithElo.length == 0) {
    throw("There are no players with elo in one of the teams.")
  }
  return playerListWithElo
  .map(p => p.elo)
  .reduce((a,b) => a+b, 0)/playerListWithElo.length
}

// Rank thresholds and names with colors
const rankTiers = [
  { name: "Bronze", min: 0, color: "#8C7853" },        // Bronze
  { name: "Silver", min: 1000, color: "#C0C0C0" },     // Silver
  { name: "Gold", min: 1200, color: "#FFD700" },       // Gold
  { name: "Platinum", min: 1400, color: "#4DD0E1" },   // Platinum
  { name: "Diamond", min: 1600, color: "#00BFFF" },    // Diamond
  { name: "Master", min: 1800, color: "#A020F0" },     // Master
  { name: "Grandmaster", min: 2000, color: "#FF3030" },// Grandmaster
  { name: "Challenger", min: 2200, color: "#FF8C00" }, // Challenger
];

export function getRankName(elo: number): string {
  for (let i = rankTiers.length - 1; i >= 0; i--) {
    if (elo >= rankTiers[i].min) {
      return rankTiers[i].name;
    }
  }
  return rankTiers[0].name;
}

export function getRankColor(elo: number): string {
  for (let i = rankTiers.length - 1; i >= 0; i--) {
    if (elo >= rankTiers[i].min) {
      return rankTiers[i].color;
    }
  }
  return rankTiers[0].color;
}

export const changeElo = async (game: Game, winnerTeamId: TeamID) => {
  const holdPlayersWithElo = []
  for (const holdPlayer of game.holdPlayers) {
    const result = await db.get("SELECT elo FROM players WHERE auth=?", [
        holdPlayer.auth,
    ]);
    holdPlayersWithElo.push({...holdPlayer, elo: result.elo })
  }
  const loserTeamId = winnerTeamId == 1 ? 2 : 1
  const winners = holdPlayersWithElo.filter(p => p.team == winnerTeamId)
  const losers = holdPlayersWithElo.filter(p => p.team == loserTeamId)
  const winnerTeamElo = getAvgElo(winners)
  const loserTeamElo = getAvgElo(losers)
  const changeLosers = losers.map(p => {
    const p1 = getp1(p.elo, winnerTeamElo)
    const change = -Math.round((k * (1 - p1)))
    if (isNaN(change)) { throw("Change is not a number.") }
    return { id: p.id, auth: p.auth, change }
  })
  const changeWinners = winners.map(p => {
    const p1 = getp1(p.elo, loserTeamElo)
    const change = Math.round((k * p1))
    if (isNaN(change)) { throw("Change is not a number.")}
    return { id: p.id, auth: p.auth, change }
  })
  const changeList = [...changeWinners, ...changeLosers]
  for (const changeTuple of changeList) {
    await db.run(`UPDATE players SET elo=elo+? WHERE auth=?`, [changeTuple.change, changeTuple.auth]);
  }
  return changeList
}
