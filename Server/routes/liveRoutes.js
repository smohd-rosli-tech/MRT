const express = require("express");
const router = express.Router();

const Match = require("../models/Match");
const Series = require("../models/Series");

const heroesRaw = require("../../Client/src/assets/heroes_UO.json");
const mapsRaw = require("../../Client/src/assets/maps.json");

const { apiLogger } = require("../modules/logger");
const {
  getRoomList,
  getRealtimeBanPick,
  getBattleStatistics,
  getReplayQueryMatch,
} = require("../services/liveService");
const { processLiveData } = require("../services/processLiveData");

const heroMap = Object.fromEntries(
  (Array.isArray(heroesRaw) ? heroesRaw : []).map((hero) => [
    String(hero.id),
    hero,
  ]),
);

const mapMap = Object.fromEntries(
  (Array.isArray(mapsRaw) ? mapsRaw : []).map((map) => [String(map.id), map]),
);

const latestRoomInfoCache = new Map();
const roomBattleTracker = new Map();
const latestBattleCache = new Map();
const EMPTY_POLLS_BEFORE_SAVE = 4;

/* -----------------------------
   Xpression helpers
----------------------------- */
const axios = require("axios");

let activeRoomId = null;
let xpressionPollTimer = null;

const SERVER_BASE =
  process.env.INTERNAL_API_BASE || "http://localhost:9005/api";

function hasValidProcessedBattle(processed = {}) {
  const mapId = Number(processed?.meta?.mapId || 0);

  const bluePlayers = processed?.teams?.team1?.players || [];
  const redPlayers = processed?.teams?.team2?.players || [];

  return mapId > 0 && (bluePlayers.length > 0 || redPlayers.length > 0);
}

/* -----------------------------
   Draft helpers
----------------------------- */

function buildLiveDraft(data = [], { firstPickerPhase1 } = {}) {
  const actualFirstPicker =
    firstPickerPhase1 === 1 || firstPickerPhase1 === 2
      ? firstPickerPhase1
      : inferFirstPickerPhase1(data);

  const plan = buildDraftPlan(actualFirstPicker || 1);

  const Draft = data.map((item) => {
    const hero = heroMap[String(item.cur_pick_hero)];

    return {
      round: Number(item.round_index),
      type: Number(item.operate_type) === 1 ? "PICK" : "BAN",
      camp: Number(item.camp),
      hero_id: item.cur_pick_hero ?? null,
      hero_name: hero?.name?.toUpperCase() || `Hero ${item.cur_pick_hero}`,
    };
  });

  if (!Draft.length) {
    return {
      Draft,
      meta: {
        current_round: -1,
        phase: "BAN",
        active_camp: null,
      },
    };
  }

  const roundCounts = Draft.reduce((acc, item) => {
    acc[item.round] = (acc[item.round] || 0) + 1;
    return acc;
  }, {});

  let nextRoundMeta = null;

  for (const round of plan.rounds) {
    const count = roundCounts[round.round_index] || 0;
    if (count < round.expected_count) {
      nextRoundMeta = round;
      break;
    }
  }

  if (!nextRoundMeta) {
    return {
      Draft,
      meta: {
        current_round: 10,
        phase: "END",
        active_camp: null,
      },
    };
  }

  return {
    Draft,
    meta: {
      current_round: nextRoundMeta.round_index,
      phase: nextRoundMeta.phase,
      active_camp: nextRoundMeta.camp,
    },
  };
}

function inferFirstPickerPhase1(data = []) {
  const round1 = data.find((item) => Number(item.round_index) === 1);
  if (round1 && (Number(round1.camp) === 1 || Number(round1.camp) === 2)) {
    return Number(round1.camp);
  }
  return null;
}

function buildDraftPlan(firstPickerPhase1) {
  const first =
    firstPickerPhase1 === 1 || firstPickerPhase1 === 2 ? firstPickerPhase1 : 1;

  const second = first === 1 ? 2 : 1;

  return {
    firstPickerPhase1: first,
    firstPickerPhase2: second,
    rounds: [
      { round_index: 0, phase: "BAN", camp: "BOTH", expected_count: 2 },

      { round_index: 1, phase: "PICK", camp: first, expected_count: 1 },
      { round_index: 2, phase: "BAN", camp: second, expected_count: 1 },
      { round_index: 3, phase: "PICK", camp: second, expected_count: 1 },
      { round_index: 4, phase: "BAN", camp: first, expected_count: 1 },

      { round_index: 5, phase: "BAN", camp: "BOTH", expected_count: 2 },

      { round_index: 6, phase: "PICK", camp: second, expected_count: 1 },
      { round_index: 7, phase: "BAN", camp: first, expected_count: 1 },
      { round_index: 8, phase: "PICK", camp: first, expected_count: 1 },
      { round_index: 9, phase: "BAN", camp: second, expected_count: 1 },
    ],
  };
}

function buildRealtimeDraftForXpression(realtime = {}) {
  const data = realtime?.data || realtime || {};

  // const histories = Array.isArray(data.suggest_histories)
  //   ? data.suggest_histories
  //   : [];

  const Draft = data
    // .filter((item) => Number(item.suggest_hero) > 0)
    .map((item) => ({
      round_index: Number(item.round_index),
      operate_type: Number(item.operate_type),
      camp: Number(item.camp),
      battle_side: Number(item.battle_side ?? 0),
      cur_pick_hero: Number(item.hero_id),
      is_no_selection: Number(item.hero_id ?? 0) === 0,
    }));

  return buildLiveDraft(Draft);
}

/* -----------------------------
   Live battle save helpers
----------------------------- */

function getBattleData(raw = {}) {
  return raw?.data || raw || {};
}

function hasValidBattleStats(raw = {}) {
  const data = getBattleData(raw);

  return (
    data.players_data &&
    Object.keys(data.players_data).length > 0 &&
    data.level_info
  );
}

function getHeroBaseId(heroId) {
  const id = Number(heroId);

  if (id === 10571 || id === 10572 || id === 10573) return 1057;

  return id;
}

function normalizeHeroName(name = "") {
  return String(name)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (s) => s.toUpperCase());
}

function getHeroRole(heroId) {
  const id = Number(heroId);

  if (!id) return "None";

  const baseId = getHeroBaseId(id);
  const hero = heroMap[String(baseId)];

  if (!hero) return "Unknown";

  if (id === 10571 && Array.isArray(hero.role))
    return hero.role[0] || "Vanguard";
  // return hero.role[0] || "Duelist";
  if (id === 10572 && Array.isArray(hero.role))
    return hero.role[0] || "Duelist";
  // return hero.role[1] || "Vanguard";
  if (id === 10573 && Array.isArray(hero.role))
    return hero.role[2] || "Strategist";

  if (Array.isArray(hero.role)) return hero.role[0] || "Unknown";

  return hero.role || "Unknown";
}

function getHeroName(heroId, type = "") {
  const id = Number(heroId);

  if (!id) {
    if (type === "PICK") return "No Pick";
    if (type === "BAN") return "No Ban";
    return "Hero 0";
  }

  const baseId = getHeroBaseId(id);
  const hero = heroMap[String(baseId)];

  return hero ? normalizeHeroName(hero.name) : `Hero ${id}`;
}

function getMapMeta(mapId) {
  const map = mapMap[String(mapId)] || {};

  return {
    id: Number(mapId || 0),
    name: (
      map.sub_name ||
      map.full_name ||
      map.name ||
      `Map ${mapId || 0}`
    ).toUpperCase(),
    mode: (map.game_mode || map.mode || map.gameMode || "").toUpperCase(),
  };
}

function buildPlayerPayload(player, playerNameMap = {}) {
  return {
    name:
      playerNameMap[player.player_uid] ||
      player.nick_name ||
      `Player ${String(player.player_uid)}`,
    uid: player.player_uid,

    hero: {
      id: player.cur_hero_id,
      name: getHeroName(player.cur_hero_id),
      role: getHeroRole(player.cur_hero_id),
    },

    kills: player.k || 0,
    deaths: player.d || 0,
    assists: player.a || 0,

    damage: player.total_damage || player.total_hero_damage || 0,
    damage_taken:
      player.total_damage_taken || player.total_hero_damage_taken || 0,
    healing: player.total_heal || player.total_hero_heal || 0,

    hit_rate: player.session_hit_rate || 0,
    solo_kill: player.solo_kill || player.dynamic_fields?.live_solo_kill || 0,
    last_kill: player.player_heroes?.[0]?.last_kill || 0,
    consecutiveKOs:
      player.max_continue_kill_count ||
      player.consecutive_kos ||
      player.dynamic_fields?.live_consecutive_kos ||
      0,
    continueKillKDA:
      player.continue_kill_kda ||
      player.dynamic_fields?.live_continue_kill_kda ||
      0,

    hp: player.hp || player.dynamic_fields?.live_hp || 0,
    ult_ratio: player.ult_ratio || player.dynamic_fields?.live_ult_ratio || 0,
  };
}

function buildLiveMatchUid(roomId, battleData = {}, roomInfo = null) {
  const level = battleData.level_info || {};

  const battleId =
    battleData.battle_id || level.battle_id || roomInfo?.battle_id;

  if (battleId) {
    return `${String(roomId)}_${String(battleId)}`;
  }

  const mapId = level.map_id || battleData.map_id || "unknownMap";

  const startTime =
    battleData.battle_start_time ||
    battleData.start_time ||
    level.fight_start_time ||
    "unknownStart";

  return `${String(roomId)}_${startTime}_${mapId}`;
}

function getHitRateFromStats(statisticsData = {}, playerUid, heroId) {
  const hitObj =
    statisticsData[`Career_HitRate_hero:${playerUid}_${heroId}`] ||
    statisticsData[`Career_HitRate_player:${playerUid}`];

  if (!hitObj || !hitObj.use_cnt) return 0;

  return (
    Number(hitObj.enemy_hit || hitObj.hero_hit || 0) /
    Number(hitObj.use_cnt || 1)
  );
}

function mapLivePlayerToMatchPlayer(
  playerUid,
  player = {},
  statisticsData = {},
) {
  const common = player?.tab_data?.common_data || {};
  const heroId = Number(player.select_hero || player.preview_hero || 0);
  const hitRateDetail =
    statisticsData[`Career_HitRate_hero:${playerUid}_${heroId}`] || {};

  return {
    player_uid: Number(playerUid),
    nick_name: player.player_name || `Player ${playerUid}`,
    // camp: Number(player.camp || 0),
    camp: Number(player.camp) || Number(player.battle_side) || 0,
    cur_hero_id: heroId,
    is_online: 1,

    k: Number(common.kill_score || 0),
    d: Number(common.death_score || 0),
    a: Number(common.assist_score || 0),

    total_hero_damage: Number(common.total_hero_damage || 0),
    total_damage: Number(common.total_hero_damage || 0),

    total_hero_heal: Number(common.total_heal || 0),
    total_heal: Number(common.total_heal || 0),

    total_hero_damage_taken: Number(common.total_token_damage || 0),
    total_damage_taken: Number(common.total_token_damage || 0),
    solo_kill: Number(player.solo_kill || 0),
    max_continue_kill_count: Number(player["consecutive KOs"] || 0),

    session_hit_rate:
      Number(common.main_hit_rate || 0) ||
      getHitRateFromStats(statisticsData, playerUid, heroId),

    curr_energy: Number(player.curr_energy || 0),
    max_energy: Number(player.max_energy || 0),

    ult_ratio:
      Number(player.max_energy || 0) > 0
        ? Number(player.curr_energy || 0) / Number(player.max_energy || 1)
        : 0,

    hp: Number(player.hp || 0),

    abilities: player.abilities_cooldown || {},
    special_data: player?.tab_data?.special_data || {},

    continue_kill_kda: Number(player["continue_kill(KDA)"] || 0),
    consecutive_kos: Number(player["consecutive KOs"] || 0),

    dynamic_fields: {
      live_responsibility: player.responsibility,
      live_hp: player.hp,
      live_curr_energy: player.curr_energy,
      live_max_energy: player.max_energy,
      live_mvp_val: player.mvp_val,
      live_solo_kill: Number(player.solo_kill || 0),
      live_continue_kill_kda: Number(player["continue_kill(KDA)"] || 0),
      live_consecutive_kos: Number(player["consecutive KOs"] || 0),
      live_respawn_time: player.respawn_time,
      live_abilities_cooldown: player.abilities_cooldown || {},
      live_special_data: player?.tab_data?.special_data || {},
      live_ult_ratio:
        Number(player.max_energy || 0) > 0
          ? Number(player.curr_energy || 0) / Number(player.max_energy || 1)
          : 0,
    },

    player_heroes: heroId
      ? [
          {
            hero_id: heroId,
            play_time: Number(
              statisticsData[
                `Career_HeroUseTime_hero:${playerUid}_${heroId}`
              ] || 0,
            ),

            k: Number(
              statisticsData[`Career_K_hero:${playerUid}_${heroId}`] ||
                common.kill_score ||
                0,
            ),
            d: Number(
              statisticsData[`Career_D_hero:${playerUid}_${heroId}`] ||
                common.death_score ||
                0,
            ),
            a: Number(
              statisticsData[`Career_A_hero:${playerUid}_${heroId}`] ||
                common.assist_score ||
                0,
            ),

            total_hero_damage: Number(
              statisticsData[`Career_Damage_hero:${playerUid}_${heroId}`] ||
                common.total_hero_damage ||
                0,
            ),
            total_hero_heal: Number(
              statisticsData[`Career_Heal_hero:${playerUid}_${heroId}`] ||
                common.total_heal ||
                0,
            ),
            total_hero_damage_taken: Number(
              statisticsData[
                `Career_DamageTaken_hero:${playerUid}_${heroId}`
              ] ||
                common.total_token_damage ||
                0,
            ),

            last_kill: Number(
              statisticsData[`Career_LastK_hero:${playerUid}_${heroId}`] || 0,
            ),
            session_hit_rate:
              Number(common.main_hit_rate || 0) ||
              getHitRateFromStats(statisticsData, playerUid, heroId),

            hit_rate_detail: hitRateDetail || {},

            hero_dynamic_fields: {
              enemy_hit: hitRateDetail?.enemy_hit || 0,
              ally_hit: hitRateDetail?.ally_hit || 0,
              real_hit_hero_cnt: hitRateDetail?.real_hit_hero_cnt || 0,
              shield_hit: hitRateDetail.shield_hit || 0,
              summoner_hit: hitRateDetail.summoner_hit || 0,
              chaos_hit: hitRateDetail.chaos_hit || 0,
              use_cnt: hitRateDetail.use_cnt || 0,
            },
          },
        ]
      : [],
  };
}

async function getRoomInfoByRoomId(roomId) {
  const roomList = await getRoomList();
  const rooms = Array.isArray(roomList?.data) ? roomList.data : [];

  return rooms.find((room) => String(room.room_id) === String(roomId)) || null;
}

function buildLiveMatchFromBattleStats(
  roomId,
  rawBattleStats = {},
  roomInfo = null,
) {
  const battleData = getBattleData(rawBattleStats);
  const level = battleData.level_info || {};
  const playersData = battleData.players_data || {};
  const statisticsData = battleData.statistics_data || {};
  const mvps = battleData.mvps || {};
  const draft = battleData.ban_pick_info || [];

  const matchPlayers = Object.entries(playersData).map(([playerUid, player]) =>
    mapLivePlayerToMatchPlayer(playerUid, player, statisticsData),
  );

  return {
    match_uid: buildLiveMatchUid(roomId, battleData, roomInfo),
    source: "live_battle",
    isTestMatch: Boolean(false),
    region: String("EMEA"),
    room_id: String(roomId),

    match_time_stamp:
      Number(battleData.battle_start_time) || Math.floor(Date.now() / 1000),
    match_map_id: Number(level.map_id ?? battleData.map_id ?? 0),
    game_mode_id: Number(level.game_mode_id ?? battleData.game_mode_id ?? 0),
    match_play_duration: Number(level.fight_time ?? battleData.fight_time ?? 0),

    mvp_uid: mvps?.[1] ? Number(mvps[1]) : undefined,
    svp_uid: mvps?.[2] ? Number(mvps[2]) : undefined,

    dynamic_fields: {
      mode_id: Number(level.mode_id || battleData.mode_id || 0),
      battle_id: String(battleData.battle_id || roomId),
      score_info: {
        1: Number(
          roomInfo?.group_info?.["1"]?.score ?? level.round_score?.[0] ?? 0,
        ),
        2: Number(
          roomInfo?.group_info?.["2"]?.score ?? level.round_score?.[1] ?? 0,
        ),
      },
      live_level_info: level,
      league_round_info: JSON.stringify({
        1: {
          club_team_name: roomInfo?.group_info?.["1"]?.name || "Team 1",
          club_team_mini_name: roomInfo?.group_info?.["1"]?.mini_name || "T1",
          score: Number(roomInfo?.group_info?.["1"]?.score ?? 0),
        },
        2: {
          club_team_name: roomInfo?.group_info?.["2"]?.name || "Team 2",
          club_team_mini_name: roomInfo?.group_info?.["2"]?.mini_name || "T2",
          score: Number(roomInfo?.group_info?.["2"]?.score ?? 0),
        },
        max_round_cnt: Number(roomInfo?.max_bo || 0),
        round_result: roomInfo?.round_results || [],
        league_tag: roomInfo?.league_tag || "",
      }),
      ban_pick_info: draft || [],
    },

    match_players: matchPlayers,
    live_snapshot: rawBattleStats,
  };
}

function isRealPlayedMatch(rawBattleStats = {}) {
  const battle = getBattleData(rawBattleStats);

  const players = battle.players_data || {};
  const level = battle.level_info || {};

  // no players
  if (Object.keys(players).length === 0) {
    return false;
  }

  // total activity check
  let totalKills = 0;
  let totalDamage = 0;
  let totalHeal = 0;

  Object.values(players).forEach((player) => {
    const common = player?.tab_data?.common_data || {};

    totalKills += Number(common.kill_score || 0);
    totalDamage += Number(common.total_hero_damage || 0);
    totalHeal += Number(common.total_heal || 0);
  });

  // absolutely nothing happened
  if (totalKills === 0 && totalDamage < 500 && totalHeal < 500) {
    return false;
  }

  return true;
}

/*************** REPLAY HELPERS ******************/
function parseJsonMaybe(value, fallback = {}) {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isReplayCampMode(match = {}) {
  const players = Array.isArray(match.match_players) ? match.match_players : [];
  return players.some((player) => Number(player.camp) === 0);
}

function normalizeReplayCamp(match = {}, camp) {
  const value = Number(camp); // Replay format: 0 = Red, 1 = Blue

  if (isReplayCampMode(match)) {
    return value === 0 ? 2 : 1;
  }

  return value;
}

function getScoreValue(scoreInfo = {}, keys = []) {
  for (const key of keys) {
    if (scoreInfo?.get) {
      const value = scoreInfo.get(String(key));
      if (value !== undefined && value !== null) return value;
    }

    if (
      scoreInfo?.[String(key)] !== undefined &&
      scoreInfo?.[String(key)] !== null
    ) {
      return scoreInfo[String(key)];
    }

    if (
      scoreInfo?.[Number(key)] !== undefined &&
      scoreInfo?.[Number(key)] !== null
    ) {
      return scoreInfo[Number(key)];
    }
  }

  return 0;
}

function getReplayTeamInfo(match = {}) {
  const league = parseJsonMaybe(match.dynamic_fields?.league_round_info, {});
  const scoreInfo = match.dynamic_fields?.score_info || {};

  return {
    blue: {
      name: league?.["1"]?.club_team_name || "Blue",
      short: league?.["1"]?.club_team_mini_name || "BLU",
      score: Number(
        getScoreValue(scoreInfo, ["0", "1"]) ?? league?.["1"]?.score ?? 0,
      ),
      // score: Number(
      //   scoreInfo?.["0"] ??
      //     scoreInfo?.["1"] ??
      //     league?.["1"]?.score ??
      //     0,
      // ),
    },
    red: {
      name: league?.["2"]?.club_team_name || "Red",
      short: league?.["2"]?.club_team_mini_name || "RED",
      score: Number(
        getScoreValue(scoreInfo, ["1", "2"]) ?? league?.["2"]?.score ?? 0,
      ),
      // score: Number(
      //   scoreInfo?.["1"] ??
      //     scoreInfo?.["2"] ??
      //     league?.["2"]?.score ??
      //     0,
      // ),
    },
  };
}

function buildReplayPlayerPayload(player = {}) {
  const heroId = Number(player.cur_hero_id || 0);

  return {
    name: player.nick_name || `Player ${player.player_uid}`,
    uid: Number(player.player_uid || 0),

    hero: {
      id: heroId,
      name: getHeroName(heroId),
      role: getHeroRole(heroId),
    },

    kills: Number(player.k || 0),
    deaths: Number(player.d || 0),
    assists: Number(player.a || 0),

    damage: Number(player.total_hero_damage || player.total_damage || 0),
    damage_taken: Number(
      player.total_damage_taken || player.total_hero_damage_taken || 0,
    ),
    healing: Number(player.total_hero_heal || player.total_heal || 0),

    hit_rate: Number(player.session_hit_rate || 0),
    solo_kill: Number(player.solo_kill || 0),
    last_kill: Number(
      player.last_kill || player.player_heroes?.[0]?.last_kill || 0,
    ),
    consecutiveKOs: Number(player.max_continue_kill_count || 0),
    continueKillKDA: Number(
      player.player_heroes?.[0]?.session_continue_kill_count || 0,
    ),

    hp: 0,
    ult_ratio: 0,
  };
}

function buildReplayStatsForXpression(matchInput = {}) {
  const match =
    typeof matchInput.toObject === "function"
      ? matchInput.toObject()
      : matchInput;

  const teamInfo = getReplayTeamInfo(match);
  const players = Array.isArray(match.match_players) ? match.match_players : [];

  // const bluePlayers = players
  //   .filter((p) => normalizeReplayCamp(p.camp) === 1)
  //   .map(buildReplayPlayerPayload);

  // const redPlayers = players
  //   .filter((p) => normalizeReplayCamp(p.camp) === 2)
  //   .map(buildReplayPlayerPayload);

  const bluePlayers = players
    .filter((p) => normalizeReplayCamp(match, p.camp) === 1)
    .map(buildReplayPlayerPayload);

  const redPlayers = players
    .filter((p) => normalizeReplayCamp(match, p.camp) === 2)
    .map(buildReplayPlayerPayload);

  const winnerCamp = normalizeReplayCamp(match, match.match_winner_side);
  const mvpPlayer = players.find(
    (p) => Number(p.player_uid) === Number(match.mvp_uid),
  );

  // const svpPlayer = players.find(
  //   (p) => Number(p.player_uid) === Number(match.svp_uid),
  // );

  const map = getMapMeta(match.match_map_id);

  return {
    Map: {
      id: Number(map.id || match.match_map_id || 0),
      name: String(map.name || "").toUpperCase(),
      mode: String(map.mode || "").toUpperCase(),
    },

    Blue: {
      name: teamInfo.blue.name,
      short: teamInfo.blue.short,
      is_win: winnerCamp === 1 ? 1 : 0,
      score: Number(teamInfo.blue.score || 0),
      players: bluePlayers,
    },

    Red: {
      name: teamInfo.red.name,
      short: teamInfo.red.short,
      is_win: winnerCamp === 2 ? 1 : 0,
      score: Number(teamInfo.red.score || 0),
      players: redPlayers,
    },

    MVP: mvpPlayer ? buildReplayPlayerPayload(mvpPlayer) : null,
  };
}

async function fetchReplayMatchFromBattleStats(roomId, rawBattleStats = {}) {
  const battleData = getBattleData(rawBattleStats);

  const replayId = String(battleData.replay_id || "");
  const zoneId = Number(battleData.zone_id || 12001);

  if (!replayId) {
    apiLogger.info(
      `:hourglass_flowing_sand: No replay_id found yet for room ${roomId}`,
    );
    return null;
  }

  const playerUid = Number(Object.keys(battleData.players_data || {})[0] || 0);

  if (!playerUid) {
    apiLogger.info(
      `:hourglass_flowing_sand: No player_uid found for replay query room ${roomId}`,
    );
    return null;
  }

  const replayResponse = await getReplayQueryMatch({
    player_uid: playerUid,
    zone_id: zoneId,
    replay_ids: [replayId],
  });

  return replayResponse?.data?.matches?.[0] || null;
}

/*************** SAVE HELPERS ******************/
async function saveMatchReplay(roomId, rawBattleStats = {}, roomInfo = null) {
  let xpressionStatsSent = false;
  const key = String(roomId);

  const replayMatch = await fetchReplayMatchFromBattleStats(
    key,
    rawBattleStats,
  );

  if (!replayMatch) {
    return {
      saved: false,
      reason: "REPLAY_NOT_READY",
    };
  }

  const payload = {
    ...replayMatch,

    source: "replay_query_match",
    room_id: key,
    dynamic_fields: {
      ...(replayMatch.dynamic_fields || {}),
      room_info: roomInfo || null,
    },
  };

  const savedMatch = await Match.findOneAndUpdate(
    { match_uid: payload.match_uid },
    { $setOnInsert: payload },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    },
  );

  apiLogger.info(`✅ Replay match saved/found: ${savedMatch.match_uid}`);

  const savedSeries = await Series.findOneAndUpdate(
    { room_id: key },
    {
      $set: {
        battle_id: String(roomInfo?.battle_id || payload.match_uid || ""),
        region: String("GLOBAL"),
        isTest: Boolean(true),
        max_bo: Number(roomInfo?.max_bo || 0),
        cur_bo: Number(roomInfo?.cur_bo || 0),
        round_results: Array.isArray(roomInfo?.round_results)
          ? roomInfo.round_results
          : [],

        team1: {
          camp: 1,
          name: roomInfo?.group_info?.["1"]?.name || "Team 1",
          mini_name: roomInfo?.group_info?.["1"]?.mini_name || "T1",
          icon_url: roomInfo?.group_info?.["1"]?.icon_url || "",
          score: Number(roomInfo?.group_info?.["1"]?.score || 0),
        },

        team2: {
          camp: 2,
          name: roomInfo?.group_info?.["2"]?.name || "Team 2",
          mini_name: roomInfo?.group_info?.["2"]?.mini_name || "T2",
          icon_url: roomInfo?.group_info?.["2"]?.icon_url || "",
          score: Number(roomInfo?.group_info?.["2"]?.score || 0),
        },

        raw_room_info: roomInfo || null,
      },

      $addToSet: {
        matches: String(savedMatch.match_uid),
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
      runValidators: true,
    },
  );

  apiLogger.info(
    `✅ Series saved/found for room ${key}, matches: ${savedSeries.matches?.length || 0}`,
  );

  try {
    const statsPayload = buildReplayStatsForXpression(savedMatch);

    apiLogger.info(":package: Built replay stats payload for Xpression:", {
      map: statsPayload.Map,
      bluePlayers: statsPayload.Blue?.players?.length || 0,
      redPlayers: statsPayload.Red?.players?.length || 0,
      hasMVP: Boolean(statsPayload.MVP),
    });

    await axios.post(`${SERVER_BASE}/xpression/stats`, {
      mode: "live",
      payload: statsPayload,
    });

    xpressionStatsSent = true;
    apiLogger.info(
      `Stable replay stats sent to Xpression: ${savedMatch.match_uid}`,
    );
  } catch (xpressionErr) {
    apiLogger.error(":x: Failed to POST replay stats to Xpression:", {
      message: xpressionErr.message,
      status: xpressionErr.response?.status,
      data: xpressionErr.response?.data,
      url: xpressionErr.config?.url,
    });
  }

  return {
    saved: true,
    xpressionStatsSent,
    match: savedMatch,
    series: savedSeries,
  };
}

async function saveLiveBattleIfNeeded(roomId, rawBattleStats) {
  const key = String(roomId);
  const currentHasBattle = hasValidBattleStats(rawBattleStats);
  const previous = roomBattleTracker.get(key);

  // Battle is currently active / valid
  if (currentHasBattle) {
    roomBattleTracker.set(key, {
      lastBattleStats: rawBattleStats,
      saved: false,
      skipped: false,
      emptyCount: 0,
      lastSeenAt: Date.now(),
    });

    return;
  }

  // No valid battle right now, but we never had previous battle data
  if (!previous?.lastBattleStats) {
    roomBattleTracker.set(key, {
      lastBattleStats: null,
      saved: false,
      skipped: false,
      emptyCount: 0,
      lastSeenAt: Date.now(),
    });

    return;
  }

  // Empty response detected
  const emptyCount = Number(previous.emptyCount || 0) + 1;

  roomBattleTracker.set(key, {
    ...previous,
    emptyCount,
    lastEmptyAt: Date.now(),
  });

  // Empty response detected
  if (emptyCount < EMPTY_POLLS_BEFORE_SAVE) {
    apiLogger.info(
      `Waiting to confirm battle ended for room ${key} (${emptyCount}/${EMPTY_POLLS_BEFORE_SAVE})`,
    );
    return;
  }

  // Already handled this battle
  if (previous.saved || previous.skipped) {
    return;
  }

  // Cancelled / fake round
  if (!isRealPlayedMatch(previous.lastBattleStats)) {
    roomBattleTracker.set(key, {
      ...previous,
      saved: true,
      skipped: true,
      emptyCount,
      skippedAt: Date.now(),
    });

    apiLogger.info(
      `:black_right_pointing_double_triangle_with_vertical_bar: Skipped cancelled round for room ${key}`,
    );
    return;
  }

  const roomInfo = await getRoomInfoByRoomId(key);

  const replaySaveResult = await saveMatchReplay(
    key,
    previous.lastBattleStats,
    roomInfo,
  );

  if (!replaySaveResult.saved) {
    const previousBattleData = getBattleData(previous.lastBattleStats);
    apiLogger.warn(
      `Failed to save replay for room ${key}, replay_id ${previousBattleData.replay_id}. Will retry later.`,
    );

    roomBattleTracker.set(key, {
      ...previous,
      emptyCount,
      saved: false,
      waitingReplay: true,
      lastReplayAttemptAt: Date.now(),
    });

    return;
  }

  roomBattleTracker.set(key, {
    ...previous,
    saved: true,
    skipped: false,
    emptyCount,
    savedAt: Date.now(),
  });

  apiLogger.info(
    `Saved live battle match: ${replaySaveResult.match.match_uid}`,
  );
}

function buildPlayerKdaUltFromProcessed(
  player = {},
  teamName = "",
  shortName = "",
) {
  const ultRatio = Number(player.ultRatio || 0);
  const percent = ultRatio * 100;

  return {
    name: player.playerName || "-",
    team: teamName,
    short: shortName,
    camp: player.camp,

    k: Number(player.kills || 0),
    d: Number(player.deaths || 0),
    a: Number(player.assists || 0),

    ult: {
      percent: Number(percent.toFixed(1)),
      is_ready: percent >= 100,
      status: percent >= 100 ? "READY" : "NOT READY",
    },

    display: `${teamName} | ${player.playerName} | ${player.kills}/${player.deaths}/${player.assists}`,
  };
}

function getLivePlayerSide(player = {}, fallbackSide = "") {
  const camp = Number(player.camp || player.raw?.camp || 0);

  if (camp === 1) return "blue";
  if (camp === 2 || camp === 0) return "red";

  return fallbackSide;
}

function buildCentralLivePlayerPayload(
  player = {},
  teamInfo = {},
  fallbackSide = "",
) {
  const ultRatio = Number(player.ultRatio || player.ult_ratio || 0);
  const ultPercentage = Number((ultRatio * 100).toFixed(1));

  return {
    playerName: player.playerName || player.name || "-",
    playerUID: Number(player.playerId || player.uid || 0),

    kill: Number(player.kills || player.k || 0),
    death: Number(player.deaths || player.d || 0),
    assist: Number(player.assists || player.a || 0),

    ultPercentage,
    ultReady: ultPercentage >= 100,

    heroID: Number(player.heroId || player.hero?.id || 0),
    heroName:
      player.heroMeta?.displayName ||
      player.heroMeta?.name ||
      player.hero?.name ||
      `Hero ${player.heroId || player.hero?.id || 0}`,
    heroRole: player.heroMeta?.role || player.hero?.role || "Unknown",

    side: getLivePlayerSide(player, fallbackSide),

    teamName: teamInfo.name || "-",
    teamShort: teamInfo.short || "-",

    damage: Number(player.damage || 0),
    healing: Number(player.heal || player.healing || 0),
    hitRate: Number(player.hitRate || player.hit_rate || 0),
    hp: Number(player.hp || 0),
  };
}

function buildXpressionPlayerFromProcessed(player = {}) {
  return {
    name: player.playerName || player.name || "-",
    uid: Number(player.playerId || player.uid || 0),

    hero: {
      id: Number(player.heroId || 0),
      name:
        player.heroMeta?.displayName ||
        player.heroMeta?.name ||
        `Hero ${player.heroId || 0}`,
      role: player.heroMeta?.role || "Unknown",
    },

    kills: Number(player.kills || 0),
    deaths: Number(player.deaths || 0),
    assists: Number(player.assists || 0),

    damage: Number(player.damage || 0),
    damage_taken: Number(
      player.damageTaken ||
        player.damage_taken ||
        player.raw?.tab_data?.common_data?.total_token_damage ||
        0,
    ),
    healing: Number(player.heal || player.healing || 0),

    hit_rate: Number(player.hitRate || 0),

    solo_kill: Number(player.raw?.solo_kill || 0),
    last_kill: Number(player.raw?.last_kill || 0),
    consecutiveKOs: Number(player.raw?.["consecutive KOs"] || 0),
    continueKillKDA: Number(player.raw?.["continue_kill(KDA)"] || 0),

    hp: Number(player.hp || 0),
    ult_ratio: Number(player.ultRatio || 0),
  };
}

function buildLiveStatsForXpression(processed = {}) {
  const bluePlayers = processed?.teams?.team1?.players || [];
  const redPlayers = processed?.teams?.team2?.players || [];

  const mvpId = Number(processed?.mvps?.mvpPlayerId || 0);

  const allPlayers = [...bluePlayers, ...redPlayers];

  const mvpPlayer = allPlayers.find(
    (player) => Number(player.playerId) === mvpId,
  );

  return {
    Map: {
      id: Number(processed?.meta?.mapId || 0),
      name: String(processed?.meta?.mapName || "").toUpperCase(),
      mode: String(processed?.meta?.mapMode || "").toUpperCase(),
    },

    Blue: {
      name: processed?.teams?.team1?.name || "Blue",
      short: processed?.teams?.team1?.miniName || "BLU",
      is_win:
        Number(processed?.meta?.scoreLeft || 0) >
        Number(processed?.meta?.scoreRight || 0)
          ? 1
          : 0,
      score: Number(processed?.meta?.scoreLeft || 0),
      players: bluePlayers.map(buildXpressionPlayerFromProcessed),
    },

    Red: {
      name: processed?.teams?.team2?.name || "Red",
      short: processed?.teams?.team2?.miniName || "RED",
      is_win:
        Number(processed?.meta?.scoreRight || 0) >
        Number(processed?.meta?.scoreLeft || 0)
          ? 1
          : 0,
      score: Number(processed?.meta?.scoreRight || 0),
      players: redPlayers.map(buildXpressionPlayerFromProcessed),
    },

    MVP: mvpPlayer ? buildXpressionPlayerFromProcessed(mvpPlayer) : null,
  };
}

/* -----------------------------
   Poller
----------------------------- */

async function pollActiveRoomForXpression() {
  if (!activeRoomId) return;

  try {
    const roomId = String(activeRoomId);

    const [battleStats, realtimeDraft] = await Promise.all([
      getBattleStatistics(roomId),
      getRealtimeBanPick(roomId), // optional, only needed if you still use realtime endpoint
    ]);

    const rawLiveData = battleStats?.data || battleStats || {};
    const realtimeData = realtimeDraft?.data || realtimeDraft || {};

    await saveLiveBattleIfNeeded(roomId, battleStats);

    const processed = processLiveData(rawLiveData, {
      heroMap,
      mapMap,
    });

    const previousProcessed = latestBattleCache.get(roomId);

    const currentMapId = Number(processed?.meta?.mapId || 0);
    const previousMapId = Number(previousProcessed?.meta?.mapId || 0);

    const mapChanged = currentMapId > 0 && currentMapId !== previousMapId;

    const draftItems = Array.isArray(realtimeData.ban_pick_info)
      ? realtimeData.ban_pick_info
      : Array.isArray(realtimeData.suggest_histories)
        ? realtimeData.suggest_histories
        : [];

    if (!hasValidProcessedBattle(processed)) {
      apiLogger.info(
        `⏸️ Skipped Xpression update for room ${roomId} because battle data is empty`,
      );
      return;
    }

    // NEW FORMAT: directly use realtime draft data if available, to avoid potential issues with battle stats draft parsing
    if (mapChanged || draftItems.length > 0) {
      const mapPayload = {
        id: Number(processed?.meta?.mapId || 0),
        name: String(processed?.meta?.mapName || "").toUpperCase(),
        mode: String(processed?.meta?.mapMode || "").toUpperCase(),
      };

      if (mapChanged) {
        await axios.post(`${SERVER_BASE}/xpression/stats`, {
          mode: "live",
          payload: {
            Map: mapPayload,

            Blue: {
              name: processed?.teams?.team1?.name || "Team 1",
              short: processed?.teams?.team1?.short || "T1",
              is_win: 0,
              score: Number(processed?.teams?.team1?.score || 0),
              players: [],
            },

            Red: {
              name: processed?.teams?.team2?.name || "Team 2",
              short: processed?.teams?.team2?.short || "T2",
              is_win: 0,
              score: Number(processed?.teams?.team2?.score || 0),
              players: [],
            },

            MVP: null,

            meta: {
              status: "WAITING_FOR_REPLAY_STATS",
              source: "map_changed",
              updatedAt: Date.now(),
            },
          },
        });

        apiLogger.info(
          `🗺️ Xpression stats map updated for room ${roomId}, map ${mapPayload.id}`,
        );
      }

      const normalizedDraftPayload = mapChanged
        ? []
        : draftItems.map((item) => {
            const heroId = Number(
              item.hero_id ??
                item.heroId ??
                item.cur_pick_hero ??
                item.suggest_hero ??
                0,
            );

            return {
              round_index: Number(
                item.round_index ?? item.roundIndex ?? item.round_idx ?? 0,
              ),
              operate_type: Number(
                item.operate_type ?? item.operateType ?? item.is_pick ?? 0,
              ),
              camp: Number(item.camp || 0),
              battle_side: Number(
                item.battle_side ??
                  item.battleSide ??
                  item.effect_battle_side ??
                  0,
              ),
              hero_id: heroId,
              is_no_selection: heroId === 0,
            };
          });

      await axios.post(`${SERVER_BASE}/xpression/draft`, {
        mode: "live",
        payload: normalizedDraftPayload,
        map: mapPayload,
        resetDraft: mapChanged,
      });

      apiLogger.info(`📤 Xpression draft updated for room ${roomId}`);
    }

    // if (mapChanged || draftItems.length > 0) {
    //   await axios.post(`${SERVER_BASE}/xpression/draft`, {
    //     mode: "live",
    //     payload: draftItems.map((item) => {
    //       const heroId = Number(
    //         item.hero_id ??
    //           item.heroId ??
    //           item.cur_pick_hero ??
    //           item.suggest_hero ??
    //           0,
    //       );

    //       return {
    //         round_index: Number(
    //           item.round_index ?? item.roundIndex ?? item.round_idx ?? 0,
    //         ),

    //         operate_type: Number(
    //           item.operate_type ?? item.operateType ?? item.is_pick ?? 0,
    //         ),

    //         camp: Number(item.camp || 0),

    //         battle_side: Number(
    //           item.battle_side ??
    //             item.battleSide ??
    //             item.effect_battle_side ??
    //             0,
    //         ),

    //         hero_id: heroId,
    //         is_no_selection: heroId === 0,
    //       };
    //     }),

    //     map: {
    //       id: Number(processed?.meta?.mapId || 0),
    //       name: String(processed?.meta?.mapName || "").toUpperCase(),
    //       mode: String(processed?.meta?.mapMode || "").toUpperCase(),
    //     },

    //     resetDraft: mapChanged,
    //   });

    //   apiLogger.info(`📤 Xpression draft updated for room ${roomId}`);
    // } 
    
    else {
      apiLogger.info(
        `⏸️ Skipped Xpression draft update for room ${roomId} because draft data is empty and map did not change`,
      );
    }

    // ✅ Update cache LAST, after both Xpression posts succeed
    latestBattleCache.set(roomId, processed);
  } catch (err) {
    apiLogger.error("❌ Failed active room Xpression polling:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
      url: err.config?.url,
    });
  }
}

function startXpressionPolling(roomId) {
  activeRoomId = String(roomId);

  if (xpressionPollTimer) {
    clearInterval(xpressionPollTimer);
  }

  pollActiveRoomForXpression();

  xpressionPollTimer = setInterval(pollActiveRoomForXpression, 800);
}

/* -----------------------------
   Routes
----------------------------- */

router.get("/rooms", async (req, res) => {
  try {
    const data = await getRoomList();

    const rooms = data?.data || data || [];

    rooms.forEach((room) => {
      const roomId = String(room.room_id);

      latestRoomInfoCache.set(roomId, {
        group_info: room.group_info || {},
      });
    });

    res.json(data);
  } catch (err) {
    apiLogger.error("Error fetching room list:", err);
    res.status(500).json({
      message: "Failed to fetch room list",
      error: err.message,
    });
  }
});

router.post("/active-room", (req, res) => {
  const roomId = String(req.body?.room_id || "");

  if (!roomId) {
    return res.status(400).json({ message: "room_id is required" });
  }

  startXpressionPolling(roomId);

  res.json({
    success: true,
    activeRoomId,
  });
});

router.get("/active-room", (req, res) => {
  res.json({
    activeRoomId,
    polling: Boolean(xpressionPollTimer),
  });
});

router.get("/ban-pick/:roomId", async (req, res) => {
  try {
    const data = await getRealtimeBanPick(req.params.roomId);
    res.json(data);
  } catch (err) {
    apiLogger.error(
      `Error fetching realtime ban pick ${req.params.roomId}:`,
      err,
    );
    res.status(500).json({
      message: "Failed to fetch realtime ban pick",
      error: err.message,
    });
  }
});

router.get("/battle/:roomId", async (req, res) => {
  try {
    const roomId = String(req.params.roomId);

    const battleStats = await getBattleStatistics(roomId);

    const rawLiveData = battleStats?.data || battleStats || {};

    const processed = processLiveData(rawLiveData, {
      heroMap,
      mapMap,
    });

    latestBattleCache.set(roomId, processed);

    res.json(processed);
  } catch (err) {
    apiLogger.error(
      `Error fetching processed battle statistics ${req.params.roomId}:`,
      err,
    );
    res.status(500).json({
      message: "Failed to fetch processed battle statistics",
      error: err.message,
    });
  }
});

router.get("/rawbattle/:roomId", async (req, res) => {
  try {
    const data = await getBattleStatistics(req.params.roomId);
    res.json(data);
  } catch (err) {
    apiLogger.error(
      `Error fetching battle statistics ${req.params.roomId}:`,
      err,
    );
    res.status(500).json({
      message: "Failed to fetch battle statistics",
      error: err.message,
    });
  }
});

router.post("/replay-query-match", async (req, res) => {
  try {
    const data = await getReplayQueryMatch(req.body || {});
    const match = data?.data?.matches?.[0] || null;
    res.json(match);
  } catch (err) {
    apiLogger.error("Error fetching replay_query_match:", err);
    res.status(500).json({
      message: "Failed to fetch replay query match",
      error: err.message,
    });
  }
});

router.get("/players/:roomId?", (req, res) => {
  try {
    const roomId =
      req.params.roomId ||
      activeRoomId ||
      Array.from(latestBattleCache.keys()).pop();

    if (!roomId) {
      return res.status(404).json({
        message: "No active room available",
      });
    }

    const data = latestBattleCache.get(String(roomId));

    if (!data) {
      return res.status(404).json({
        message: "No live data available",
        roomId,
      });
    }

    const roomInfo = latestRoomInfoCache.get(String(roomId)) || {};

    const team1Info = {
      name:
        roomInfo.group_info?.["1"]?.name ||
        data?.teams?.team1?.name ||
        "Team 1",
      short:
        roomInfo.group_info?.["1"]?.mini_name ||
        data?.teams?.team1?.miniName ||
        "T1",
    };

    const team2Info = {
      name:
        roomInfo.group_info?.["2"]?.name ||
        data?.teams?.team2?.name ||
        "Team 2",
      short:
        roomInfo.group_info?.["2"]?.mini_name ||
        data?.teams?.team2?.miniName ||
        "T2",
    };

    const team1Players = data?.teams?.team1?.players || [];
    const team2Players = data?.teams?.team2?.players || [];

    res.json({
      roomId: String(roomId),
      updatedAt: Date.now(),

      Team1: team1Players.map((player, index) => ({
        index: index + 1,
        spectateKey: `F${index + 1}`,
        ...buildCentralLivePlayerPayload(player, team1Info, "blue"),
      })),

      Team2: team2Players.map((player, index) => ({
        index: index + 1,
        spectateKey: `F${index + 7}`,
        ...buildCentralLivePlayerPayload(player, team2Info, "red"),
      })),
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
});

router.get("/blue/:playerIndex", (req, res) => {
  try {
    const playerIndex = Number(req.params.playerIndex);

    const latestRoom = Array.from(latestBattleCache.keys()).pop();
    const data = latestBattleCache.get(latestRoom);

    if (!data) {
      return res.status(404).json({ message: "No live data available" });
    }

    const roomInfo = latestRoomInfoCache.get(latestRoom) || {};
    const teamName = roomInfo.group_info?.["1"]?.name || "BLUE";
    const shortName = roomInfo.group_info?.["1"]?.mini_name || "BLU";

    const players = data?.teams?.team1?.players || [];
    const player = players[playerIndex - 1];

    if (!player) {
      return res.status(404).json({ message: "Player not found" });
    }

    res.json(buildPlayerKdaUltFromProcessed(player, teamName, shortName));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/red/:playerIndex", (req, res) => {
  try {
    const playerIndex = Number(req.params.playerIndex);

    const latestRoom = Array.from(latestBattleCache.keys()).pop();
    const data = latestBattleCache.get(latestRoom);

    if (!data) {
      return res.status(404).json({ message: "No live data available" });
    }

    const roomInfo = latestRoomInfoCache.get(latestRoom) || {};
    const teamName = roomInfo.group_info?.["2"]?.name || "RED";
    const shortName = roomInfo.group_info?.["2"]?.mini_name || "RED";
    const players = data?.teams?.team2?.players || [];
    const player = players[playerIndex - 1];

    if (!player) {
      return res.status(404).json({ message: "Player not found" });
    }

    res.json(buildPlayerKdaUltFromProcessed(player, teamName, shortName));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
