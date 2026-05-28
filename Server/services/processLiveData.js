function toTitle(text = '') {
  return String(text)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, s => s.toUpperCase());
}

function normalizeHeroName(name = '') {
  return String(name)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, s => s.toUpperCase());
}

function toHeroFileName(name = '') {
  return String(name)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w-]/g, '');
}

const HERO_IMAGE_ALIASES = {
  10571: 1057, // Deadpool Duelist
  10572: 1057, // Deadpool Vanguard
  10573: 1057, // Deadpool Strategist
}

function formatHeroMeta(heroId, heroMap = {}) {
  const imageHeroId = HERO_IMAGE_ALIASES[Number(heroId)] || heroId
  const hero =
    heroMap[String(heroId)] ||
    heroMap[String(imageHeroId)] ||
    heroMap[Number(imageHeroId)]

  if (!hero) {
    return {
      id: heroId,
      imageId: imageHeroId,
      name: `Hero ${heroId}`,
      displayName: `Hero ${heroId}`,
      image: '/imgs/heroes/0_unknown.png',
      abilities: [],
    }
  }

  const displayName = normalizeHeroName(hero.name)

  return {
    ...hero,
    id: heroId,          
    imageId: imageHeroId,
    displayName,
    image: `/imgs/heroes/${imageHeroId}_${toHeroFileName(displayName)}.png`,
    abilities: Array.isArray(hero.abilities) ? hero.abilities : [],
  }
}

// before deadpool rework
// function formatHeroMeta(heroId, heroMap = {}) {
//   const hero = heroMap[String(heroId)] || heroMap[Number(heroId)];
//   if (!hero) {
//     return {
//       id: heroId,
//       name: `Hero ${heroId}`,
//       displayName: `Hero ${heroId}`,
//       image: '/imgs/heroes/0_unknown.png',
//       abilities: [],
//     };
//   }

//   const displayName = normalizeHeroName(hero.name);

//   return {
//     ...hero,
//     displayName,
//     image: `/imgs/heroes/${heroId}_${toHeroFileName(displayName)}.png`,
//     abilities: Array.isArray(hero.abilities) ? hero.abilities : [],
//   };
// }

function getAbilityName(heroId, abilityId, heroMap = {}) {
  const hero = heroMap[String(heroId)] || heroMap[Number(heroId)];
  if (!hero?.abilities) return null;

  const found = hero.abilities.find(a => Number(a.id) === Number(abilityId));
  return found?.name || null;
}

function buildTeamSummary(players = []) {
  const total = players.reduce(
    (acc, p) => {
      acc.kills += Number(p.kills || 0);
      acc.deaths += Number(p.deaths || 0);
      acc.assists += Number(p.assists || 0);
      acc.damage += Number(p.damage || 0);
      acc.heal += Number(p.heal || 0);
      acc.hitRate += Number(p.hitRate || 0);
      return acc;
    },
    { kills: 0, deaths: 0, assists: 0, damage: 0, heal: 0, hitRate: 0 }
  );

  return {
    ...total,
    avgHitRate: players.length ? total.hitRate / players.length : 0,
  };
}

function processBanPickInfo(banPickInfo = [], heroMap = {}) {
  return banPickInfo.map((item) => {
    const heroMeta = formatHeroMeta(item.hero_id, heroMap);

    return {
      roundIndex: item.round_index ?? item.round_idx ?? 0,
      operateType: item.operate_type ?? (Number(item.is_pick) === 1 ? 1 : 0),
      camp: item.camp ?? item.effect_battle_side ?? item.battle_side ?? 0,
      heroId: item.hero_id,
      heroName: heroMeta.displayName,
      heroImage: heroMeta.image,
      isPick:
        item.operate_type !== undefined
          ? Number(item.operate_type) === 1
          : Number(item.is_pick) === 1,
    };
  });
}

function processPlayers(playersData = {}, mvps = {}, heroMap = {}) {
  const players = Object.entries(playersData).map(([playerId, player]) => {
    const common = player?.tab_data?.common_data || {};
    const heroId = player?.select_hero;
    const heroMeta = formatHeroMeta(heroId, heroMap);

    const abilities = Object.entries(player?.abilities_cooldown || {}).map(
      ([id, value]) => ({
        id,
        name: getAbilityName(heroId, id, heroMap),
        ...value,
      })
    );

    const maxEnergy = Number(player?.max_energy || 0);
    const currEnergy = Number(player?.curr_energy || 0);

    return {
      playerId,
      camp: Number(player?.camp || 0),
      playerName: player?.player_name || `Player ${playerId}`,
      heroId,
      heroMeta,
      responsibility: player?.responsibility,
      hp: Number(player?.hp || 0),
      currEnergy,
      maxEnergy,
      ultRatio: maxEnergy > 0 ? currEnergy / maxEnergy : 0,
      mvpVal: Number(player?.mvp_val || 0),
      isMVP: Number(mvps?.[1]) === Number(playerId),
      isSVP: Number(mvps?.[2]) === Number(playerId),

      kills: Number(common.kill_score || 0),
      deaths: Number(common.death_score || 0),
      assists: Number(common.assist_score || 0),
      damage: Number(common.total_hero_damage || 0),
      heal: Number(common.total_heal || 0),
      hitRate: Number(common.main_hit_rate || 0),

      rawCommon: common,
      abilities,
      raw: player,
    };
  });

  return players;
}

function processObjective(levelInfo = {}) {
  const pointArr = levelInfo?.point_character_num || [0, 0];
  const owner = Number(levelInfo?.current_owner || 0);
  const percent = Math.max(
    0,
    Math.min(100, Number(levelInfo?.current_degree || 0) * 100)
  );

  const team1OnPoint = Number(pointArr[0] || 0);
  const team2OnPoint = Number(pointArr[1] || 0);
  const contested = team1OnPoint > 0 && team2OnPoint > 0;

  return {
    owner,
    percent,
    team1OnPoint,
    team2OnPoint,
    contested,
    label: contested
      ? 'CONTESTED'
      : owner === 1
        ? 'CAMP 1 CONTROL'
        : owner === 2
          ? 'CAMP 2 CONTROL'
          : 'NEUTRAL',
  };
}

function processLiveData(rawLiveData = {}, { heroMap = {}, mapMap = {} } = {}) {
  const levelInfo = rawLiveData?.level_info || {};
  const mvps = rawLiveData?.mvps || {};
  const playersData = rawLiveData?.players_data || {};
  const banPickInfo = rawLiveData?.ban_pick_info || rawLiveData?.draft_info || [];

  const players = processPlayers(playersData, mvps, heroMap);
  const team1Players = players.filter(p => p.camp === 1);
  const team2Players = players.filter(p => p.camp === 2 || p.camp === 0);

  const mapId = levelInfo?.map_id;
  const mapMeta = mapMap[String(mapId)] || mapMap[Number(mapId)] || null;

  return {
    meta: {
      mapId,
      mapName: mapMeta?.sub_name || mapMeta?.name || `Map ${mapId || '-'}`,
      mapMode: mapMeta?.game_mode || null,
      roundIndex: levelInfo?.round_index ?? 0,
      fightTime: Number(levelInfo?.fight_time || 0),
      scoreLeft: Number(levelInfo?.round_score?.[0] || 0),
      scoreRight: Number(levelInfo?.round_score?.[1] || 0),
    },

    objective: processObjective(levelInfo),

    teams: {
      team1: {
        camp: 1,
        players: team1Players,
        summary: buildTeamSummary(team1Players),
      },
      team2: {
        camp: 2,
        players: team2Players,
        summary: buildTeamSummary(team2Players),
      },
    },

    draft: processBanPickInfo(banPickInfo, heroMap),

    mvps: {
      mvpPlayerId: mvps?.[1] ?? null,
      svpPlayerId: mvps?.[2] ?? null,
    },

    updatedAt: Date.now(),
    raw: rawLiveData,
  };
}

module.exports = {
  processLiveData,
};