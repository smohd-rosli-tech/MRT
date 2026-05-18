const express = require("express");
const router = express.Router();

const Match = require("../models/Match");

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

/* -----------------------------
   Xpression helpers
----------------------------- */
const axios = require("axios");

let activeRoomId = null;
let xpressionPollTimer = null;

const XPRESSION_BASE =
  process.env.INTERNAL_API_BASE || "http://localhost:9000/api/xpression";

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

  const histories = Array.isArray(data.suggest_histories)
    ? data.suggest_histories
    : [];

  const Draft = histories
    .filter((item) => Number(item.suggest_hero) > 0)
    .map((item) => ({
      round_index: Number(item.round_index),
      operate_type: Number(item.operate_type),
      camp: Number(item.camp),
      battle_side: Number(item.battle_side ?? 0),
      cur_pick_hero: Number(item.suggest_hero),
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

function buildLiveMatchUid(roomId, battleData = {}) {
  const level = battleData.level_info || {};
  const mapId = level.map_id || "unknownMap";
  const roundIndex = level.round_index ?? "unknownRound";

  const startTime =
    battleData.battle_start_time ||
    battleData.start_time ||
    level.fight_start_time ||
    Math.floor(Date.now() / 1000);

  return `${String(roomId)}_${startTime}_${mapId}_${roundIndex}`;
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

  const matchPlayers = Object.entries(playersData).map(([playerUid, player]) =>
    mapLivePlayerToMatchPlayer(playerUid, player, statisticsData),
  );

  return {
    match_uid: buildLiveMatchUid(roomId, battleData),
    source: "live_battle",
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
      ban_pick_info: battleData.ban_pick_info || [],
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

async function saveLiveBattleIfNeeded(roomId, rawBattleStats) {
  const key = String(roomId);
  const currentHasBattle = hasValidBattleStats(rawBattleStats);
  const previous = roomBattleTracker.get(key);

  if (currentHasBattle) {
    roomBattleTracker.set(key, {
      lastBattleStats: rawBattleStats,
      saved: false,
      lastSeenAt: Date.now(),
    });
    return;
  }

  if (!currentHasBattle && previous?.lastBattleStats && !previous.saved) {
    if (!isRealPlayedMatch(previous.lastBattleStats)) {
      roomBattleTracker.set(key, {
        ...previous,
        saved: true,
        skipped: true,
        skippedAt: Date.now(),
      });

      apiLogger.info(`⏭️ Skipped cancelled round for room ${key}`);
      return;
    }

    const roomInfo = await getRoomInfoByRoomId(key);
    const payload = buildLiveMatchFromBattleStats(
      key,
      previous.lastBattleStats,
      roomInfo,
    );

    await Match.findOneAndUpdate(
      { match_uid: payload.match_uid },
      { $setOnInsert: payload },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    await Series.findOneAndUpdate(
      { room_id: key },
      {
        $set: {
          battle_id: roomInfo?.battle_id,
          max_bo: roomInfo?.max_bo || 0,
          cur_bo: roomInfo?.cur_bo || 0,
          round_results: roomInfo?.round_results || [],

          team1: {
            camp: 1,
            name: roomInfo?.group_info?.["1"]?.name || "Team 1",
            mini_name: roomInfo?.group_info?.["1"]?.mini_name || "T1",
            icon_url: roomInfo?.group_info?.["1"]?.icon_url || "",
            score: roomInfo?.group_info?.["1"]?.score || 0,
          },

          team2: {
            camp: 2,
            name: roomInfo?.group_info?.["2"]?.name || "Team 2",
            mini_name: roomInfo?.group_info?.["2"]?.mini_name || "T2",
            icon_url: roomInfo?.group_info?.["2"]?.icon_url || "",
            score: roomInfo?.group_info?.["2"]?.score || 0,
          },

          raw_room_info: roomInfo || null,
        },

        $addToSet: {
          matches: payload.match_uid,
        },
      },
      {
        upsert: true,
        new: true,
      },
    );

    roomBattleTracker.set(key, {
      ...previous,
      saved: true,
      savedAt: Date.now(),
    });

    apiLogger.info(`✅ Saved live battle match: ${payload.match_uid}`);
  }
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

function buildLiveStatsForXpression(processed = {}) {
  return {
    Map: {
      id: processed?.meta?.mapId,
      name: processed?.meta?.mapName,
      mode: processed?.meta?.mapMode,
      fight_time: processed?.meta?.fightTime,
    },

    Blue: {
      name: "Blue",
      short: "BLU",
      score: processed?.meta?.scoreLeft || 0,
      summary: processed?.teams?.team1?.summary || {},
      players: processed?.teams?.team1?.players || [],
    },

    Red: {
      name: "Red",
      short: "RED",
      score: processed?.meta?.scoreRight || 0,
      summary: processed?.teams?.team2?.summary || {},
      players: processed?.teams?.team2?.players || [],
    },

    MVP: processed?.mvps?.mvpPlayerId || null,
    SVP: processed?.mvps?.svpPlayerId || null,
    Objective: processed?.objective || {},
    updatedAt: Date.now(),
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
      getRealtimeBanPick(roomId),
    ]);

    const rawLiveData = battleStats?.data || battleStats || {};

    await saveLiveBattleIfNeeded(roomId, battleStats);

    const processed = processLiveData(rawLiveData, {
      heroMap,
      mapMap,
    });

    latestBattleCache.set(roomId, processed);

    await axios.post(`${XPRESSION_BASE}/xpression/stats`, {
      mode: "live",
      payload: buildLiveStatsForXpression(processed),
    });

    // await axios.post(`${XPRESSION_BASE}/xpression/draft`, {
    //   mode: "live",
    //   realtime: processed.draft,
    // });

    await axios.post(`${XPRESSION_BASE}/xpression/draft`, {
      mode: "live",
      realtime: realtimeDraft,
      map: {
        id: processed?.meta?.mapId,
        name: processed?.meta?.mapName,
        mode: processed?.meta?.mapMode,
      }
    });
  } catch (err) {
    apiLogger.error("❌ Failed active room Xpression polling:", err.message);
  }
}

function startXpressionPolling(roomId) {
  activeRoomId = String(roomId);

  if (xpressionPollTimer) {
    clearInterval(xpressionPollTimer);
  }

  pollActiveRoomForXpression();

  xpressionPollTimer = setInterval(pollActiveRoomForXpression, 500);
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

    await saveLiveBattleIfNeeded(roomId, battleStats);

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
