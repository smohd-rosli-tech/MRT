<template>
  <q-page class="draft-page q-pa-md">
    <div class="page-header q-mb-md">
      <div>
        <div class="text-h4 text-weight-bold">Live Draft</div>
        <div class="text-caption text-grey-5">
          Active Room:
          <span class="text-white text-weight-bold">
            {{ currentRoomId || 'No active room selected' }}
          </span>
        </div>
      </div>

      <div class="row items-center q-gutter-sm">
        <q-badge
          :color="isPolling ? 'positive' : 'grey-7'"
          :label="isPolling ? 'POLLING' : 'STOPPED'"
        />

        <q-btn
          color="primary"
          icon="refresh"
          label="Refresh"
          :disable="!currentRoomId"
          :loading="loading"
          @click="loadDraft"
        />

        <q-btn
          color="grey-8"
          icon="arrow_back"
          label="Back"
          @click="router.back()"
        />
      </div>
    </div>

    <q-card flat bordered class="status-card q-mb-md">
      <q-card-section>
        <div class="status-grid">
          <div>
            <div class="status-label">Current Round</div>
            <div class="status-value">
              {{ xpressionDraft?.meta?.current_round ?? '-' }}
            </div>
          </div>

          <div>
            <div class="status-label">Phase</div>
            <div class="status-value">
              {{ xpressionDraft?.meta?.phase || '-' }}
            </div>
          </div>

          <div>
            <div class="status-label">Active Camp</div>
            <div class="status-value">
              {{ getCampLabel(xpressionDraft?.meta?.active_camp) }}
            </div>
          </div>

          <div>
            <div class="status-label">Completed</div>
            <div class="status-value">
              {{ xpressionDraft?.meta?.completed_steps || 0 }}
              /
              {{ xpressionDraft?.meta?.total_steps || 12 }}
            </div>
          </div>

          <div>
            <div class="status-label">Timer</div>
            <div class="status-value">
              {{ xpressionDraft?.Timer?.remaining ?? 20 }}s
            </div>
          </div>

          <div>
            <div class="status-label">Last Updated</div>
            <div class="status-value small">
              {{ lastUpdatedLabel }}
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <q-card flat bordered class="draft-card q-mb-md">
      <q-card-section>
        <div class="draft-header q-mb-md">
          <div>
            <div class="text-h6 text-weight-bold">Draft Slots</div>
            <div class="text-caption text-grey-5">
              Always returns 12 slots for Xpression
            </div>
          </div>

          <q-btn
            dense
            outline
            color="negative"
            icon="restart_alt"
            label="Reset Xpression Draft"
            @click="resetDraft"
            v-if="isViewMode === '9004'"
          />
        </div>

        <div class="draft-layout">
          <div class="team-panel blue-panel">
            <div class="team-title">BLUE</div>

            <div class="phase-section">
              <div class="phase-title">Picks</div>

              <div class="slot-grid">
                <DraftSlot
                  v-for="slot in bluePicks"
                  :key="`blue-pick-${slot.round}-${slot.slot}`"
                  :draft-slot="draftSlot"
                />
              </div>
            </div>

            <div class="phase-section">
              <div class="phase-title">Bans</div>

              <div class="slot-grid bans">
                <DraftSlot
                  v-for="slot in blueBans"
                  :key="`blue-ban-${slot.round}-${slot.slot}`"
                  :draft-slot="draftSlot"
                />
              </div>
            </div>
          </div>

          <div class="center-panel">
            <div class="map-box">
              <div class="map-label">Map</div>
              <div class="map-name">
                {{ xpressionDraft?.Map?.name || '-' }}
              </div>
              <div class="map-mode">
                {{ xpressionDraft?.Map?.mode || '-' }}
              </div>
            </div>

            <div class="current-box">
              <div class="map-label">Current</div>
              <div class="current-phase">
                {{ xpressionDraft?.meta?.phase || '-' }}
              </div>
              <div class="current-camp">
                {{ getCampLabel(xpressionDraft?.meta?.active_camp) }}
              </div>
            </div>
          </div>

          <div class="team-panel red-panel">
            <div class="team-title">RED</div>

            <div class="phase-section">
              <div class="phase-title">Picks</div>

              <div class="slot-grid">
                <DraftSlot
                  v-for="slot in redPicks"
                  :key="`red-pick-${slot.round}-${slot.slot}`"
                  :draft-slot="slot"
                />
              </div>
            </div>

            <div class="phase-section">
              <div class="phase-title">Bans</div>

              <div class="slot-grid bans">
                <DraftSlot
                  v-for="slot in redBans"
                  :key="`red-ban-${slot.round}-${slot.slot}`"
                  :draft-slot="slot"
                />
              </div>
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <q-card flat bordered class="raw-card">
      <q-expansion-item
        dark
        dense
        icon="data_object"
        label="Debug / Xpression Draft Payload"
      >
        <pre>{{ JSON.stringify(xpressionDraft, null, 2) }}</pre>
      </q-expansion-item>
    </q-card>
  </q-page>
</template>

<script setup>
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useRoute, useRouter } from 'vue-router'
import { api } from 'boot/axios'

import heroesRaw from '../assets/heroes_UO.json'
import mapsRaw from '../assets/maps.json'

// Change this import to your actual store path/name if different
import { useSeshStore } from 'src/stores/sesh'

const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const seshStore = useSeshStore()
const isViewMode = window.location.port
const heroes = Array.isArray(heroesRaw) ? heroesRaw : []
const maps = Array.isArray(mapsRaw) ? mapsRaw : []

const heroMap = Object.fromEntries(
  heroes.map((hero) => [Number(hero.id), hero])
)

const mapMap = Object.fromEntries(
  maps.map((map) => [Number(map.id), map])
)

const HERO_IMAGE_ALIASES = {
  10571: 1057,
  10572: 1057,
  10573: 1057,
}

const loading = ref(false)
const isPolling = ref(false)
const rawRealtimeDraft = ref(null)
const xpressionDraft = ref(buildBlankXpressionDraft())
const lastUpdatedAt = ref(null)
const pollTimer = ref(null)

const currentRoomId = computed(() => {
  return String(seshStore.room || route.query?.roomId || '')
})

const lastUpdatedLabel = computed(() => {
  if (!lastUpdatedAt.value) return '-'

  return new Date(lastUpdatedAt.value).toLocaleTimeString()
})

const draftSlots = computed(() => {
  return xpressionDraft.value?.Draft || []
})

const bluePicks = computed(() => {
  return draftSlots.value.filter(
    (slot) => Number(slot.camp) === 1 && slot.type === 'PICK',
  )
})

const blueBans = computed(() => {
  return draftSlots.value.filter(
    (slot) => Number(slot.camp) === 1 && slot.type === 'BAN',
  )
})

const redPicks = computed(() => {
  return draftSlots.value.filter(
    (slot) => Number(slot.camp) === 2 && slot.type === 'PICK',
  )
})

const redBans = computed(() => {
  return draftSlots.value.filter(
    (slot) => Number(slot.camp) === 2 && slot.type === 'BAN',
  )
})

const DraftSlot = defineComponent({
  name: 'DraftSlot',
  props: {
    draftSlot: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () =>
      h(
        'div',
        {
          class: [
            'draft-slot',
            props.draftSlot?.type?.toLowerCase(),
            props.draftSlot?.locked ? 'locked' : 'empty',
          ],
        },
        [
          h('div', { class: 'slot-top' }, [
            h('span', props.draftSlot?.slot),
            h('span', props.draftSlot?.type),
          ]),

          h('div', { class: 'hero-frame' }, [
            h('img', {
              class: 'hero-img',
              src: props.draftSlot?.hero?.image || '/imgs/heroes/empty.png',
              alt: props.draftSlot?.hero?.name || 'Hero',
              onError: (event) => {
                event.target.src = '/imgs/heroes/empty.png'
              },
            }),
          ]),

          h(
            'div',
            { class: 'hero-name' },
            props.draftSlot?.hero?.name || 'Hero 0',
          ),

          h(
            'div',
            { class: 'hero-role' },
            props.draftSlot?.hero?.role || 'Unknown',
          ),
        ],
      )
  },
})
function normalizeHeroName(name = '') {
  return String(name)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (s) => s.toUpperCase())
}

function toHeroFileName(name = '') {
  return String(name)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w-]/g, '')
}

function getHeroBaseId(heroId) {
  const id = Number(heroId)

  if (id === 10571 || id === 10572 || id === 10573) {
    return 1057
  }

  return id
}

function getHeroRole(heroId) {
  const id = Number(heroId)

  if (!id) return 'Unknown'

  const baseId = getHeroBaseId(id)
  const hero = heroMap[baseId]

  if (!hero) return 'Unknown'

  if (id === 10571 && Array.isArray(hero.role)) return hero.role[0] || 'Duelist'
  if (id === 10572 && Array.isArray(hero.role)) return hero.role[1] || 'Vanguard'
  if (id === 10573 && Array.isArray(hero.role)) return hero.role[2] || 'Strategist'

  if (Array.isArray(hero.role)) return hero.role[0] || 'Unknown'

  return hero.role || 'Unknown'
}

function getHeroMeta(heroId) {
  const id = Number(heroId || 0)

  if (!id) {
    return {
      id: 0,
      name: 'Hero 0',
      role: 'Unknown',
      image: '/imgs/heroes/empty.png',
    }
  }

  const imageHeroId = HERO_IMAGE_ALIASES[id] || id
  const hero = heroMap[id] || heroMap[imageHeroId]

  const name = normalizeHeroName(hero?.name || `Hero ${id}`)

  return {
    id,
    name,
    role: getHeroRole(id),
    image: `/imgs/heroes/${imageHeroId}_${toHeroFileName(name)}.png`,
  }
}

function getMapMeta(mapId) {
  const id = Number(mapId || 0)
  const map = mapMap[id] || {}

  return {
    id,
    name: map.sub_name || map.full_name || map.name || `Map ${id || 0}`,
    mode: map.game_mode || '',
  }
}

function buildDraftPlan() {
  const first = 2
  const second = 1

  return {
    rounds: [
      { round_index: 0, phase: 'BAN', camp: 'BOTH' },

      { round_index: 1, phase: 'PICK', camp: first },
      { round_index: 2, phase: 'BAN', camp: second },
      { round_index: 3, phase: 'PICK', camp: second },
      { round_index: 4, phase: 'BAN', camp: first },

      { round_index: 5, phase: 'BAN', camp: 'BOTH' },

      { round_index: 6, phase: 'PICK', camp: second },
      { round_index: 7, phase: 'BAN', camp: first },
      { round_index: 8, phase: 'PICK', camp: first },
      { round_index: 9, phase: 'BAN', camp: second },
    ],
  }
}

function buildEmptyDraftSkeleton() {
  const plan = buildDraftPlan()
  const slotCounter = {
    1: 0,
    2: 0,
  }

  return plan.rounds.flatMap((round) => {
    const camps = round.camp === 'BOTH' ? [1, 2] : [Number(round.camp)]

    return camps.map((camp) => {
      slotCounter[camp] += 1

      return {
        round: Number(round.round_index),
        type: round.phase,
        camp,
        slot: camp === 1 ? `Blue ${slotCounter[camp]}` : `Red ${slotCounter[camp]}`,
        hero: getHeroMeta(0),
        locked: false,
      }
    })
  })
}

function getDraftMeta(slots = []) {
  const next = slots.find((slot) => !slot.locked)

  if (!next) {
    return {
      current_round: 10,
      phase: 'END',
      active_camp: null,
      is_complete: true,
      completed_steps: slots.length,
      total_steps: slots.length,
    }
  }

  return {
    current_round: next.round,
    phase: next.type,
    active_camp: next.camp,
    is_complete: false,
    completed_steps: slots.filter((slot) => slot.locked).length,
    total_steps: slots.length,
  }
}

function getDraftTimer(raw = {}) {
  const data = raw?.data || raw || {}

  const remaining =
    Number(data.ban_pick_time_limit) >= 0
      ? Math.ceil(Number(data.ban_pick_time_limit))
      : 20

  return {
    phase_seconds: 20,
    remaining,
  }
}

function normalizeRealtimeDraft(raw = {}) {
  const data = raw?.data || raw || {}

  const histories = Array.isArray(data.suggest_histories)
    ? data.suggest_histories
    : []

  return histories
    .filter((item) => Number(item.suggest_hero) > 0)
    .map((item) => ({
      round_index: Number(item.round_index),
      operate_type: Number(item.operate_type),
      camp: Number(item.camp),
      battle_side: Number(item.battle_side ?? 0),
      hero_id: Number(item.suggest_hero),
    }))
}

function buildDraftFromRealtime(raw = {}) {
  const data = raw?.data || raw || {}
  const slots = buildEmptyDraftSkeleton()
  const histories = normalizeRealtimeDraft(raw)

  histories.forEach((item, index) => {
    if (!slots[index]) return

    const heroId = Number(item.hero_id || 0)

    slots[index] = {
      ...slots[index],
      round: Number(item.round_index ?? slots[index].round),
      type: Number(item.operate_type) === 1 ? 'PICK' : 'BAN',
      camp: Number(item.camp || slots[index].camp),
      hero: getHeroMeta(heroId),
      locked: heroId > 0,
    }
  })

  const currentInfo = Array.isArray(data.cur_round_banpick_info)
    ? data.cur_round_banpick_info
    : []

  const current = currentInfo.map((item) => {
    const heroId = Number(item.cur_pick_hero || 0)

    return {
      round: Number(item.round_index ?? -1),
      type: Number(item.operate_type) === 1 ? 'PICK' : 'BAN',
      camp: Number(item.camp || 0),
      battle_side: Number(item.battle_side ?? 0),
      hero: getHeroMeta(heroId),
    }
  })

  return {
    Map: getMapMeta(data.map_id || 0),
    Timer: getDraftTimer(raw),
    Draft: slots,
    Current: current,
    meta: getDraftMeta(slots),
  }
}

function getCampLabel(camp) {
  if (Number(camp) === 1) return 'Blue'
  if (Number(camp) === 2) return 'Red'
  if (camp === 'BOTH') return 'Both'
  return '-'
}

async function loadDraft() {
  if (!currentRoomId.value || currentRoomId.value === '120001') return

  loading.value = true

  try {
    const response = await api.get(`/live/ban-pick/${currentRoomId.value}`)

    rawRealtimeDraft.value = response.data

    const built = buildDraftFromRealtime(response.data)

    xpressionDraft.value = built
    lastUpdatedAt.value = Date.now()

  } catch (err) {
    console.error('Failed to load draft:', err)

    $q.notify({
      type: 'negative',
      message: 'Failed to load draft',
    })
  } finally {
    loading.value = false
  }
}

async function resetDraft() {
  try {
    const response = await api.get('/xpression/draft/reset')
    xpressionDraft.value = response.data?.data || buildBlankXpressionDraft()

    $q.notify({
      type: 'positive',
      message: 'Xpression draft reset',
    })
  } catch (err) {
    console.error('Failed to reset draft:', err)

    $q.notify({
      type: 'negative',
      message: 'Failed to reset Xpression draft',
    })
  }
}

function buildBlankXpressionDraft() {
  const Draft = buildEmptyDraftSkeleton()

  return {
    Map: {},
    Timer: {
      phase_seconds: 20,
      remaining: 20,
    },
    Draft,
    Current: [],
    meta: getDraftMeta(Draft),
  }
}

function startPolling() {
  stopPolling()

  if (!currentRoomId.value || currentRoomId.value === '120001') return

  isPolling.value = true

  loadDraft()

  pollTimer.value = setInterval(() => {
    loadDraft()
  }, 500)
}

function stopPolling() {
  if (pollTimer.value) {
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }

  isPolling.value = false
}

watch(
  currentRoomId,
  (roomId) => {
    if (roomId) {
      startPolling()
    } else {
      stopPolling()
      xpressionDraft.value = buildBlankXpressionDraft()
    }
  },
  { immediate: true },
)

onMounted(() => {
  if (currentRoomId.value !== '120001') {
    startPolling()
  }
})

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<style scoped>
.draft-page {
  min-height: 100vh;
  background: #111827;
  color: white;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-card,
.draft-card,
.raw-card {
  background: #1f2937;
  color: white;
  border-color: rgba(255, 255, 255, 0.1);
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
}

.status-label {
  font-size: 11px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.status-value {
  font-size: 22px;
  font-weight: 800;
}

.status-value.small {
  font-size: 14px;
}

.draft-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.draft-layout {
  display: grid;
  grid-template-columns: 1fr 260px 1fr;
  gap: 16px;
}

.team-panel {
  padding: 14px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.78);
}

.blue-panel {
  box-shadow: inset 4px 0 0 #2563eb;
}

.red-panel {
  box-shadow: inset 4px 0 0 #dc2626;
}

.team-title {
  font-size: 24px;
  font-weight: 900;
  margin-bottom: 14px;
}

.blue-panel .team-title {
  color: #60a5fa;
}

.red-panel .team-title {
  color: #f87171;
}

.phase-section {
  margin-bottom: 18px;
}

.phase-title {
  font-size: 13px;
  font-weight: 800;
  color: #d1d5db;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}

.slot-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(90px, 1fr));
  gap: 10px;
}

.slot-grid.bans {
  grid-template-columns: repeat(2, minmax(70px, 1fr));
}

.center-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.map-box,
.current-box {
  padding: 18px;
  border-radius: 18px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  text-align: center;
}

.map-label {
  font-size: 11px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.map-name,
.current-phase {
  font-size: 24px;
  font-weight: 900;
  margin-top: 6px;
}

.map-mode,
.current-camp {
  color: #d1d5db;
  font-size: 14px;
}

:deep(.draft-slot) {
  position: relative;
  min-height: 138px;
  border-radius: 14px;
  overflow: hidden;
  background: #020617;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

:deep(.draft-slot.pick.locked) {
  border-color: rgba(96, 165, 250, 0.65);
}

:deep(.draft-slot.ban.locked) {
  border-color: rgba(239, 68, 68, 0.65);
}

:deep(.draft-slot.empty) {
  opacity: 0.55;
}

:deep(.slot-top) {
  position: absolute;
  z-index: 2;
  top: 6px;
  left: 6px;
  right: 6px;
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  font-weight: 800;
  color: white;
  text-shadow: 0 1px 2px black;
}

:deep(.hero-frame) {
  height: 86px;
  background: #111827;
  overflow: hidden;
}

:deep(.hero-img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.12) translateY(-5%);
}

:deep(.draft-slot.ban .hero-img) {
  filter: grayscale(1) brightness(0.48);
}

:deep(.hero-name) {
  padding: 7px 8px 0;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.hero-role) {
  padding: 0 8px 8px;
  font-size: 11px;
  color: #9ca3af;
}

.raw-card pre {
  white-space: pre-wrap;
  font-size: 12px;
  color: #d1d5db;
  margin: 0;
  padding: 12px;
}

@media (max-width: 1200px) {
  .draft-layout {
    grid-template-columns: 1fr;
  }

  .status-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
